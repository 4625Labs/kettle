import type { SupabaseClient } from "@supabase/supabase-js";
import { chatComplete } from "@/lib/agent/inference";
import { seededFloat } from "./rng";
import { sanitizePersonaText } from "./safety";

// Cheapest/fastest text model, benched at ~850ms p50 with 5/5 valid JSON against
// qwen3.8-flash-next (~1050ms p50, also 5/5) — see docs/agents/simworld.md task 1.
const PERSONA_MODEL = "laguna-s-2.1";

export interface VendorPersona {
  vendorId: string;
  vendorName: string;
  personaPrompt: string;
  tone: string;
  reliability: number;
  priceBands: Record<string, { min: number; max: number }>;
}

export async function loadVendorPersona(supabase: SupabaseClient, vendorId: string): Promise<VendorPersona> {
  const { data, error } = await supabase
    .from("vendor_personas")
    .select("vendor_id, persona_prompt, tone, reliability, price_bands, companies(name)")
    .eq("vendor_id", vendorId)
    .single();
  if (error) throw new Error(`loadVendorPersona(${vendorId}): ${error.message}`);
  const row = data as {
    vendor_id: string;
    persona_prompt: string;
    tone: string;
    reliability: number;
    price_bands: Record<string, { min: number; max: number }>;
    companies: { name: string } | { name: string }[] | null;
  };
  const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
  return {
    vendorId: row.vendor_id,
    vendorName: company?.name ?? "Unknown Vendor",
    personaPrompt: row.persona_prompt,
    tone: row.tone,
    reliability: row.reliability,
    priceBands: row.price_bands,
  };
}

// Price and lead time are decided by code, within the persona's seeded band — never by the model
// (requirement W2). `seedKey` should uniquely identify the quote/invoice so repeats are stable.

export function pickUnitPrice(persona: VendorPersona, productId: string, seedKey: string): number {
  const band = persona.priceBands[productId];
  if (!band) throw new Error(`no price band for product ${productId} on vendor ${persona.vendorId}`);
  return Math.round(seededFloat(`price:${seedKey}`, band.min, band.max) * 100) / 100;
}

// Lead time is a deterministic function of persona reliability: less reliable vendors (budget,
// e.g. Northwind at 0.75) run long lead times; highly reliable ones (premium, e.g. Fabrikam at
// 0.97) run short ones. Tuned so 0.75 -> ~[14,18]d, 0.90 -> ~[8,11]d, 0.97 -> ~[5,7]d.
export function pickLeadTimeDays(persona: VendorPersona, seedKey: string): number {
  const minDays = 4 + (1 - persona.reliability) * 40;
  const maxDays = minDays + (2 + (1 - persona.reliability) * 8);
  return Math.round(seededFloat(`lead:${seedKey}`, minDays, maxDays));
}

// A deterministic ~7-11% overbill (W3): $195 quoted -> ~$210-217 billed, matching the demo's
// "$212 vs $195" example. Only ever applied to the first invoice for a PO (see hasPayableInvoice).
export function overbillUnitPrice(basePrice: number, seedKey: string): number {
  const pct = seededFloat(`overbill:${seedKey}`, 0.07, 0.11);
  return Math.round(basePrice * (1 + pct) * 100) / 100;
}

async function draftMessage(persona: VendorPersona, instruction: string): Promise<string> {
  const system = [
    `You are a sales rep for ${persona.vendorName}. ${persona.personaPrompt}`,
    `Tone: ${persona.tone}.`,
    "Respond with ONLY compact JSON: {\"message\": string}. The message is 2-4 sentences of plain",
    "prose, no markdown, no code. You are told exact numbers below — quote them verbatim, never",
    "invent or change a price, quantity, or date.",
  ].join(" ");
  const raw = await chatComplete(
    [
      { role: "system", content: system },
      { role: "user", content: instruction },
    ],
    { model: PERSONA_MODEL, temperature: 0.7 },
  );
  const jsonText = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  try {
    const parsed = JSON.parse(jsonText) as { message?: unknown };
    if (typeof parsed.message === "string" && parsed.message.trim()) {
      return sanitizePersonaText(parsed.message);
    }
  } catch {
    // fall through to the raw-text fallback below
  }
  return sanitizePersonaText(raw);
}

export async function draftQuoteMessage(
  persona: VendorPersona,
  params: { quantity: number; unitPrice: number; leadTimeDays: number; neededBy: string | null },
): Promise<string> {
  const instruction =
    `Write a short RFQ reply quoting a unit price of $${params.unitPrice.toFixed(2)} and a lead ` +
    `time of ${params.leadTimeDays} days for ${params.quantity} units` +
    (params.neededBy ? `, needed by ${params.neededBy}.` : ".");
  return draftMessage(persona, instruction);
}

export async function draftDisputeReply(
  persona: VendorPersona,
  params: { valid: boolean; quotedPrice: number; billedPrice: number; reason: string },
): Promise<string> {
  const instruction = params.valid
    ? `A customer disputed invoice pricing (reason: "${params.reason}"). Your billed price of ` +
      `$${params.billedPrice.toFixed(2)}/unit was wrong; the correct quoted price is ` +
      `$${params.quotedPrice.toFixed(2)}/unit. Apologize briefly and confirm you're sending a ` +
      `corrected invoice at $${params.quotedPrice.toFixed(2)}/unit.`
    : `A customer disputed invoice pricing (reason: "${params.reason}"), but your billed price of ` +
      `$${params.billedPrice.toFixed(2)}/unit matches the original quote of ` +
      `$${params.quotedPrice.toFixed(2)}/unit. Politely stand by the invoice as billed.`;
  return draftMessage(persona, instruction);
}
