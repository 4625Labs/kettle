import type { z } from "zod";
import { callTool, type ChatMessage, type ToolSpec } from "./inference";
import type { LlmStats } from "./ledger";

export interface Decision<T> {
  data: T;
  llm: LlmStats | null;
  /** Set when the model failed and the deterministic fallback was used. */
  fallbackReason?: string;
}

/**
 * Asks the model for a structured decision. On any inference failure (timeout, HTTP error,
 * validation after the repair retry) returns the deterministic fallback instead, so the golden
 * path survives an LLM outage (§8). Callers log `fallbackReason` on the step.
 */
export async function decide<T extends z.ZodTypeAny>(
  messages: ChatMessage[],
  tool: ToolSpec<T>,
  fallback: () => z.infer<T>,
  opts: { timeoutMs?: number; temperature?: number } = {},
): Promise<Decision<z.infer<T>>> {
  if (process.env.KETTLE_DISABLE_LLM === "1") {
    return { data: fallback(), llm: null, fallbackReason: "LLM disabled (KETTLE_DISABLE_LLM=1)" };
  }
  try {
    const r = await callTool(messages, tool, { timeoutMs: opts.timeoutMs ?? 20_000, temperature: opts.temperature });
    return {
      data: r.data,
      llm: { model: r.model, latencyMs: r.latencyMs, tokensIn: r.tokensIn, tokensOut: r.tokensOut },
    };
  } catch (err) {
    return {
      data: fallback(),
      llm: null,
      fallbackReason: `model unavailable, deterministic fallback used: ${err instanceof Error ? err.message.slice(0, 200) : String(err)}`,
    };
  }
}

/** Wraps untrusted text (vendor messages, extracted invoice text) as clearly delimited data. */
export function untrusted(label: string, text: string): string {
  const clean = text.replace(/[<>]/g, "").slice(0, 2000);
  return `<untrusted_data source="${label}">\n${clean}\n</untrusted_data>`;
}

export function json(value: unknown): string {
  return JSON.stringify(value, null, 1);
}
