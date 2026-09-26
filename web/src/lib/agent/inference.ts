// Thin client for Vultr Serverless Inference (OpenAI-compatible chat completions).
// Docs: https://docs.vultr.com/products/serverless/inference/provisioning

const VULTR_INFERENCE_BASE_URL =
  process.env.VULTR_INFERENCE_BASE_URL ?? "https://api.vultrinference.com/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function chatComplete(
  messages: ChatMessage[],
  opts: { model?: string; temperature?: number } = {},
) {
  const res = await fetch(`${VULTR_INFERENCE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VULTR_INFERENCE_API_KEY}`,
    },
    body: JSON.stringify({
      model: opts.model ?? process.env.VULTR_INFERENCE_MODEL ?? "llama3.1-8b-instruct",
      messages,
      temperature: opts.temperature ?? 0.2,
    }),
  });

  if (!res.ok) {
    throw new Error(`Vultr inference request failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.choices[0].message.content as string;
}
