// Thin client for Vultr Serverless Inference (OpenAI-compatible chat completions, vLLM behind it).
// Docs: https://docs.vultr.com/products/serverless/inference/provisioning
import { z } from "zod";

const VULTR_INFERENCE_BASE_URL =
  process.env.VULTR_INFERENCE_BASE_URL ?? "https://api.vultrinference.com/v1";

// Chosen by web/evals/model-bench.ts (see docs in that file). Override per role via env.
export const DEFAULT_AGENT_MODEL = "deepseek-v4.1-flash";

export function agentModel(): string {
  return process.env.VULTR_AGENT_MODEL ?? DEFAULT_AGENT_MODEL;
}

function defaultModel(): string {
  const fromEnv = process.env.VULTR_INFERENCE_MODEL;
  // The old placeholder id doesn't exist on Vultr; ignore it if a stale .env still carries it.
  return fromEnv && fromEnv !== "llama3.1-8b-instruct" ? fromEnv : DEFAULT_AGENT_MODEL;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

// Kept for Sim-world (persona text). Signature is part of the cross-agent interface.
export async function chatComplete(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number } = {},
) {
  const data = await postChat({
    model: opts.model ?? defaultModel(),
    messages,
    temperature: opts.temperature ?? 0.2,
  });
  return (data.choices[0].message.content ?? "") as string;
}

// --- Low-level request with timeout ---------------------------------------------------------

type WireMessage =
  | ChatMessage
  | { role: "assistant"; content: string | null; tool_calls: WireToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };

interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

interface ChatResponse {
  model: string;
  choices: {
    message: { content: string | null; tool_calls?: WireToolCall[]; reasoning?: string | null };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export class InferenceError extends Error {
  constructor(
    message: string,
    readonly kind: "http" | "timeout" | "validation" | "no_tool_call",
  ) {
    super(message);
    this.name = "InferenceError";
  }
}

async function postChat(body: Record<string, unknown>, timeoutMs = 30_000): Promise<ChatResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${VULTR_INFERENCE_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VULTR_INFERENCE_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new InferenceError(
        `Vultr inference request failed: ${res.status} ${(await res.text()).slice(0, 500)}`,
        "http",
      );
    }
    return (await res.json()) as ChatResponse;
  } catch (err) {
    if (controller.signal.aborted) {
      throw new InferenceError(`Vultr inference timed out after ${timeoutMs} ms`, "timeout");
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// --- Structured tool call: zod-validated, one repair retry -----------------------------------

export interface ToolSpec<T extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: T;
}

export interface ToolCallResult<T> {
  data: T;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  attempts: number;
}

export interface CallToolOptions {
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  /** Extra attempts after a validation failure, with the error fed back. Default 1. */
  repairRetries?: number;
}

/**
 * Forces the model to answer by calling exactly one tool whose arguments match `tool.schema`.
 * Throws InferenceError after the repair retry is used up; callers fall back to deterministic logic.
 */
export async function callTool<T extends z.ZodTypeAny>(
  messages: ChatMessage[],
  tool: ToolSpec<T>,
  opts: CallToolOptions = {},
): Promise<ToolCallResult<z.infer<T>>> {
  const model = opts.model ?? agentModel();
  const repairRetries = opts.repairRetries ?? 1;
  const parameters = z.toJSONSchema(tool.schema, { target: "draft-7", io: "input" });
  delete (parameters as Record<string, unknown>).$schema;

  const convo: WireMessage[] = [...messages];
  const started = Date.now();
  let tokensIn = 0;
  let tokensOut = 0;
  let lastError = "";

  for (let attempt = 1; attempt <= repairRetries + 1; attempt++) {
    const res = await postChat(
      {
        model,
        messages: convo,
        temperature: opts.temperature ?? 0.1,
        tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters } }],
        tool_choice: { type: "function", function: { name: tool.name } },
      },
      opts.timeoutMs,
    );
    tokensIn += res.usage?.prompt_tokens ?? 0;
    tokensOut += res.usage?.completion_tokens ?? 0;

    const msg = res.choices[0]?.message;
    const call = msg?.tool_calls?.find((c) => c.function.name === tool.name) ?? msg?.tool_calls?.[0];
    const rawArgs = call?.function.arguments ?? extractJson(msg?.content ?? "");

    let parsedJson: unknown;
    try {
      parsedJson = rawArgs ? JSON.parse(rawArgs) : undefined;
    } catch {
      parsedJson = undefined;
    }

    const result = parsedJson === undefined ? null : tool.schema.safeParse(parsedJson);
    if (result?.success) {
      return {
        data: result.data,
        model: res.model ?? model,
        latencyMs: Date.now() - started,
        tokensIn,
        tokensOut,
        attempts: attempt,
      };
    }

    lastError = result
      ? z.prettifyError(result.error)
      : call
        ? `arguments were not valid JSON: ${rawArgs?.slice(0, 200)}`
        : "you did not call the tool";

    // Feed the error back and ask for a corrected call.
    const callId = call?.id ?? `repair-${attempt}`;
    convo.push({
      role: "assistant",
      content: null,
      tool_calls: [
        { id: callId, type: "function", function: { name: tool.name, arguments: rawArgs ?? "{}" } },
      ],
    });
    convo.push({
      role: "tool",
      tool_call_id: callId,
      content: `Invalid ${tool.name} call:\n${lastError}\nCall ${tool.name} again with corrected arguments.`,
    });
  }

  throw new InferenceError(`${tool.name}: model output failed validation: ${lastError}`, "validation");
}

function extractJson(text: string): string | undefined {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return start >= 0 && end > start ? text.slice(start, end + 1) : undefined;
}
