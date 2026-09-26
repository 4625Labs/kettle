// Sales Agent: S2 (validate won deal), S3 (emit handoffs), S4 (reflect payment status).
import { z } from "zod";
import type { PaymentStatusPayload, ReceivableOverduePayload } from "@/lib/contracts";
import { addDays, isoDate, must, serviceDb } from "../db";
import { emitHandoff } from "../handoffs";
import { recordStep } from "../ledger";
import { decide, json } from "../llm";
import { loadPolicies } from "../policies";
import { SALES_SYSTEM } from "../prompts/sales";
import { validateDeal } from "../rules";

const NEEDED_BY_DAYS = 30;

const validationTool = {
  name: "submit_deal_validation",
  description: "Record the validation summary for a won deal.",
  schema: z.object({
    summary: z.string().min(10).max(600).describe("1-3 sentence audit-trail summary citing the checks"),
    risk_notes: z.string().max(300).optional().describe("Optional: anything the ops manager should watch"),
  }),
};

export async function validateWonDeal(runId: string, dealId: string) {
  const db = serviceDb();
  const deal = must(
    await db.from("deals").select("id, title, stage, value, closed_at, company_id, companies(name)").eq("id", dealId).single(),
    "load deal",
  );
  const lines = must(
    await db.from("deal_line_items").select("product_id, quantity, unit_price, products(name)").eq("deal_id", dealId),
    "load line items",
  );
  const policies = await loadPolicies();
  const customerName = (deal.companies as { name: string } | null)?.name ?? null;
  const v = validateDeal({
    stage: deal.stage,
    value: Number(deal.value),
    customer_name: customerName,
    lines: lines.map((l) => ({ product_id: l.product_id, quantity: l.quantity, unit_price: Number(l.unit_price) })),
    targetMarginPct: policies.targetMarginPct,
  });

  const closedAt = deal.closed_at ? new Date(deal.closed_at) : new Date();
  const neededBy = isoDate(addDays(closedAt, NEEDED_BY_DAYS));
  const line = lines[0];
  const productName = (line?.products as { name: string } | null)?.name ?? "item";

  const facts = {
    deal: deal.title,
    customer: customerName,
    value: Number(deal.value),
    line_items: lines.map((l) => ({ product: (l.products as { name: string } | null)?.name, quantity: l.quantity, unit_price: Number(l.unit_price) })),
    checks: v.checks,
    all_checks_pass: v.ok,
    target_unit_cost: v.targetUnitCost,
    needed_by: `${neededBy} (deal has no needed-by date; policy is close date + ${NEEDED_BY_DAYS} days)`,
  };
  const d = await decide(
    [
      { role: "system", content: SALES_SYSTEM },
      { role: "user", content: `A deal was marked won. Validation results computed by code:\n${json(facts)}\nSummarize the validation.` },
    ],
    validationTool,
    () => ({
      summary: v.ok
        ? `All ${v.checks.length} checks pass for ${deal.title}: ${line?.quantity} x ${productName} at $${Number(line?.unit_price)}, target unit cost $${v.targetUnitCost} for a ${policies.targetMarginPct}% margin.`
        : `Validation failed: ${v.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`).join("; ")}.`,
    }),
  );

  await recordStep({
    runId,
    agent: "sales",
    action: "deal.validate",
    input: { deal_id: dealId },
    output: { ...facts, risk_notes: d.data.risk_notes, fallback: d.fallbackReason },
    status: v.ok ? "ok" : "flagged",
    rationale: d.data.summary,
    llm: d.llm,
  });

  if (!v.ok || !line) return { ok: false as const, checks: v.checks };

  await emitHandoff({
    runId,
    from: "sales",
    to: "procurement",
    type: "purchase_request.create",
    idempotencyKey: `${runId}:purchase_request.create:${dealId}`,
    dealId,
    payload: {
      deal_id: dealId,
      product_id: line.product_id,
      description: `${line.quantity} x ${productName} for ${customerName}`,
      quantity: line.quantity,
      needed_by: neededBy,
      target_unit_cost: v.targetUnitCost,
    },
    rationale: `Won deal needs ${line.quantity} x ${productName} by ${neededBy} at or under $${v.targetUnitCost}/unit.`,
  });
  await emitHandoff({
    runId,
    from: "sales",
    to: "finance",
    type: "customer_invoice.create",
    idempotencyKey: `${runId}:customer_invoice.create:${dealId}`,
    dealId,
    payload: {
      deal_id: dealId,
      customer_id: deal.company_id,
      amount: Number(deal.value),
      due_date: isoDate(addDays(new Date(), 30)),
    },
    rationale: `Bill ${customerName} $${Number(deal.value).toLocaleString("en-US")} for the won deal, net 30.`,
  });
  return { ok: true as const };
}

// S4: Finance reports the customer paid (or a payment changed state).
export async function recordPaymentStatus(runId: string, p: PaymentStatusPayload) {
  await recordStep({
    runId,
    agent: "sales",
    action: "deal.payment_status",
    input: p,
    output: { deal_id: p.deal_id, account_health: p.status === "sent" ? "good" : "watch", fulfilled_and_collected: p.status === "sent" },
    rationale:
      p.status === "sent"
        ? `Customer paid $${p.amount.toLocaleString("en-US")}. Deal is fulfilled and collected; account health good.`
        : `Customer payment is ${p.status}; keeping the account on watch.`,
  });
}

// F5 -> S4: Finance reports an overdue receivable.
export async function handleOverdue(runId: string, p: ReceivableOverduePayload) {
  await recordStep({
    runId,
    agent: "sales",
    action: "deal.receivable_overdue",
    input: p,
    output: { deal_id: p.deal_id, account_health: "at_risk" },
    status: "flagged",
    rationale: `Receivable of $${p.amount.toLocaleString("en-US")} is ${p.days_overdue} day(s) overdue; account marked at risk and the rep should follow up.`,
  });
}
