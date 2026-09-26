// Deterministic business rules. Numbers are decided here, never by the model (the model explains
// and chooses among options these functions produce). Pure functions: no I/O.
import { round2 } from "./db";

// --- Vendor scoring (P3) ---------------------------------------------------------------------

export interface QuoteInput {
  vendor_id: string;
  vendor_name: string;
  unit_price: number;
  lead_time_days: number;
  reliability: number;
}

export interface ScoredQuote extends QuoteInput {
  price_score: number;
  lead_score: number;
  reliability_score: number;
  meets_deadline: boolean;
  within_target: boolean;
  score: number;
  eligible: boolean;
}

export const SCORE_WEIGHTS = { price: 0.5, lead: 0.2, reliability: 0.3 } as const;

export function scoreQuotes(
  quotes: QuoteInput[],
  ctx: { daysUntilNeeded: number; targetUnitCost: number },
): ScoredQuote[] {
  const minPrice = Math.min(...quotes.map((q) => q.unit_price));
  return quotes
    .map((q) => {
      const meets = q.lead_time_days <= ctx.daysUntilNeeded;
      const within = q.unit_price <= ctx.targetUnitCost;
      const price = minPrice / q.unit_price;
      const lead = meets ? 1 - (q.lead_time_days / Math.max(ctx.daysUntilNeeded, 1)) * 0.5 : 0;
      const rel = Math.min(Math.max(q.reliability, 0), 1);
      let score = SCORE_WEIGHTS.price * price + SCORE_WEIGHTS.lead * lead + SCORE_WEIGHTS.reliability * rel;
      if (!within) score -= 0.1;
      if (!meets) score *= 0.5;
      return {
        ...q,
        price_score: round3(price),
        lead_score: round3(lead),
        reliability_score: round3(rel),
        meets_deadline: meets,
        within_target: within,
        score: round3(score),
        eligible: meets,
      };
    })
    .sort((a, b) => b.score - a.score);
}

// --- Deal validation (S2) --------------------------------------------------------------------

export interface DealCheck {
  name: string;
  ok: boolean;
  detail: string;
}

export function validateDeal(deal: {
  stage: string;
  value: number;
  customer_name: string | null;
  lines: { product_id: string; quantity: number; unit_price: number }[];
  targetMarginPct: number;
}): { ok: boolean; checks: DealCheck[]; lineTotal: number; targetUnitCost: number } {
  const lineTotal = round2(deal.lines.reduce((s, l) => s + l.quantity * l.unit_price, 0));
  const line = deal.lines[0];
  const targetUnitCost = line ? round2(line.unit_price * (1 - deal.targetMarginPct / 100)) : 0;
  const checks: DealCheck[] = [
    { name: "stage_won", ok: deal.stage === "won", detail: `stage is "${deal.stage}"` },
    { name: "customer", ok: !!deal.customer_name, detail: deal.customer_name ?? "missing customer" },
    {
      name: "line_items",
      ok: deal.lines.length === 1 && deal.lines.every((l) => l.quantity > 0 && l.unit_price > 0),
      detail: `${deal.lines.length} line item(s)`,
    },
    {
      name: "value_matches_lines",
      ok: Math.abs(lineTotal - deal.value) <= 0.01,
      detail: `deal value ${deal.value} vs line total ${lineTotal}`,
    },
    {
      name: "margin_target",
      ok: targetUnitCost > 0,
      detail: `target unit cost ${targetUnitCost} for a ${deal.targetMarginPct}% margin`,
    },
  ];
  return { ok: checks.every((c) => c.ok), checks, lineTotal, targetUnitCost };
}

// --- 3-way match (F2, F3) --------------------------------------------------------------------

export type MatchIssueCode =
  | "unit_price_mismatch"
  | "quantity_mismatch"
  | "quantity_exceeds_receipt"
  | "total_mismatch"
  | "vendor_mismatch"
  | "duplicate_invoice"
  | "unknown_po";

export interface MatchIssue {
  code: MatchIssueCode;
  expected: number | string | null;
  actual: number | string | null;
  variance_pct?: number;
}

export interface MatchResult {
  matched: boolean;
  issues: MatchIssue[];
  tolerance_pct: number;
}

export function threeWayMatch(input: {
  po: { unit_price: number; quantity: number; vendor_id: string } | null;
  receivedQuantity: number;
  invoice: { unit_price: number; quantity: number; total: number; vendor_id: string };
  tolerancePct: number;
  duplicate: boolean;
}): MatchResult {
  const { po, invoice, tolerancePct } = input;
  const issues: MatchIssue[] = [];
  if (!po) {
    issues.push({ code: "unknown_po", expected: null, actual: null });
    return { matched: false, issues, tolerance_pct: tolerancePct };
  }
  if (input.duplicate) issues.push({ code: "duplicate_invoice", expected: null, actual: null });
  if (po.vendor_id !== invoice.vendor_id) {
    issues.push({ code: "vendor_mismatch", expected: po.vendor_id, actual: invoice.vendor_id });
  }
  const priceVar = variancePct(po.unit_price, invoice.unit_price);
  if (priceVar > tolerancePct) {
    issues.push({ code: "unit_price_mismatch", expected: po.unit_price, actual: invoice.unit_price, variance_pct: priceVar });
  }
  const qtyVar = variancePct(po.quantity, invoice.quantity);
  if (qtyVar > tolerancePct) {
    issues.push({ code: "quantity_mismatch", expected: po.quantity, actual: invoice.quantity, variance_pct: qtyVar });
  }
  if (invoice.quantity > input.receivedQuantity) {
    issues.push({ code: "quantity_exceeds_receipt", expected: input.receivedQuantity, actual: invoice.quantity });
  }
  const computed = round2(invoice.unit_price * invoice.quantity);
  if (Math.abs(computed - invoice.total) > Math.max(1, computed * 0.001)) {
    issues.push({ code: "total_mismatch", expected: computed, actual: invoice.total });
  }
  return { matched: issues.length === 0, issues, tolerance_pct: tolerancePct };
}

export function variancePct(expected: number, actual: number): number {
  if (expected === 0) return actual === 0 ? 0 : 100;
  return round2((Math.abs(actual - expected) / expected) * 100);
}

function round3(n: number) {
  return Math.round(n * 1000) / 1000;
}
