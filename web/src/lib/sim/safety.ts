// Vendor/persona text is untrusted input (W2, requirement 6): it must never carry instructions
// into another agent's prompt. Every piece of LLM-authored persona flavor text passes through
// `sanitizePersonaText` before it's stored or handed to a job payload.

const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const CODE_FENCE = /```[\s\S]*?```/g;
const INJECTION_PATTERNS = [
  /ignore\s+(all|any|the)?\s*(previous|prior|above)?\s*instructions?/gi,
  /disregard\s+(all|any|the)?\s*(previous|prior|above)?\s*instructions?/gi,
  /system\s*prompt/gi,
  /you\s+are\s+now\s+/gi,
  /new\s+instructions?:/gi,
];

export function sanitizePersonaText(raw: string, opts: { maxLen?: number } = {}): string {
  const maxLen = opts.maxLen ?? 600;
  let text = raw.replace(CONTROL_CHARS, "").replace(CODE_FENCE, "");
  for (const pattern of INJECTION_PATTERNS) {
    text = text.replace(pattern, "[redacted]");
  }
  text = text.replace(/\s+/g, " ").trim();
  if (text.length > maxLen) text = `${text.slice(0, maxLen - 1)}…`;
  return text;
}

// Optional best-effort screening via nemotron-3.5-content-safety (requirement 6). Never blocks
// the golden path: any failure (network, unexpected shape) is treated as "not flagged".
export async function screenPersonaText(text: string): Promise<{ flagged: boolean; categories?: string[] }> {
  const baseUrl = process.env.VULTR_INFERENCE_BASE_URL ?? "https://api.vultrinference.com/v1";
  try {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.VULTR_INFERENCE_API_KEY}`,
      },
      body: JSON.stringify({
        model: "nemotron-3.5-content-safety",
        messages: [{ role: "user", content: text }],
        temperature: 0,
      }),
    });
    if (!res.ok) return { flagged: false };
    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? "";
    const flagged = /\bunsafe\b/i.test(content);
    return { flagged };
  } catch {
    return { flagged: false };
  }
}
