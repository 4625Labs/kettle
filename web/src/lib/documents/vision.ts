// `chatComplete` (src/lib/agent/inference.ts) is agents-core's and takes text-only messages, so
// it can't carry an image_url content block. This is a narrow, local sibling for the one thing
// F6 needs: a single-image vision call. Same base URL/auth as chatComplete; do not edit that file.

const VULTR_INFERENCE_BASE_URL = process.env.VULTR_INFERENCE_BASE_URL ?? "https://api.vultrinference.com/v1";

export async function visionComplete(params: {
  model: string;
  systemPrompt: string;
  userText: string;
  imagePngBase64: string;
  temperature?: number;
}): Promise<string> {
  const res = await fetch(`${VULTR_INFERENCE_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.VULTR_INFERENCE_API_KEY}`,
    },
    body: JSON.stringify({
      model: params.model,
      temperature: params.temperature ?? 0,
      messages: [
        { role: "system", content: params.systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: params.userText },
            { type: "image_url", image_url: { url: `data:image/png;base64,${params.imagePngBase64}` } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    throw new Error(`visionComplete: Vultr inference request failed: ${res.status} ${await res.text()}`);
  }
  const data = await res.json();
  return data.choices[0].message.content as string;
}
