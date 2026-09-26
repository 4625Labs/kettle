// Procurement Agent: P1 (purchase request), P2 (RFQs), P3 (score + select), P4 (PO + approval gate),
// P5 (dispute invoice mismatches), P6-lite (simulated goods receipt on issue).
import { z } from "zod";
import type { InvoiceAnomalyPayload, PurchaseRequestCreatePayload, VendorInvoicePayload } from "@/lib/contracts";
import { requestApproval } from "../approvals";
import { EscalationError } from "../errors";
import { addDays, must, round2, serviceDb } from "../db";
import { loadPoContext, purchaseRequestOrigin } from "../entities";
import { emitHandoff } from "../handoffs";
import { recordStep } from "../ledger";
import { decide, json, untrusted } from "../llm";
import { loadPolicies } from "../policies";
import { PROCUREMENT_SYSTEM } from "../prompts/procurement";
import { enqueue, enqueueUnknown } from "../queue";
import { scoreQuotes, variancePct, type ScoredQuote } from "../rules";
import { generateVendorInvoice, type ExtractedInvoice } from "../sim-bridge";

// P1 + P2
export async function handlePurchaseRequest(runId: string, handoffId: string, p: PurchaseRequestCreatePayload) {
  const db = serviceDb();
  const handoff = must(await db.from("handoffs").select("purchase_request_id").eq("id", handoffId).single(), "load handoff");

  let prId = handoff.purchase_request_id;
  if (!prId) {
    const pr = must(
      await db
        .from("purchase_requests")
        .insert({ deal_id: p.deal_id, description: p.description, quantity: p.quantity, needed_by: p.needed_by, status: "comparing" })
        .select("id")
        .single(),
      "create PR",
    );
    prId = pr.id;
    await db.from("handoffs").update({ purchase_request_id: prId }).eq("id", handoffId);
    await recordStep({
      runId,
      agent: "procurement",
      action: "purchase_request.create",
      input: p,
      output: { purchase_request_id: prId },
      rationale: `Opened a purchase request for ${p.description}, needed by ${p.needed_by}, target $${p.target_unit_cost}/unit.`,
    });
  }

  const vendors = must(
    await db.from("vendor_personas").select("vendor_id, reliability, companies(name)"),
    "load vendors",
  );
  const vendorIds = vendors.map((v) => v.vendor_id);
  await enqueue("vendor.rfq", { run_id: runId, purchase_request_id: prId, vendor_ids: vendorIds });
  await recordStep({
    runId,
    agent: "procurement",
    action: "rfq.send",
    input: { purchase_request_id: prId },
    output: { vendors: vendors.map((v) => (v.companies as { name: string } | null)?.name ?? v.vendor_id) },
    rationale: `Requested quotes from ${vendors.length} vendors.`,
  });
}

const selectTool = (eligible: string[]) => ({
  name: "select_vendor",
  description: "Select the winning vendor quote.",
  schema: z.object({
    vendor_id: z.enum(eligible as [string, ...string[]]).describe("vendor_id of an eligible quote"),
    rationale: z.string().min(10).max(600),
  }),
});

// P3 + P4: runs after the vendor.rfq handler has written the quotes.
export async function selectVendor(runId: string, prId: string) {
  const db = serviceDb();
  const { data: existingPo } = await db.from("purchase_orders").select("id").eq("purchase_request_id", prId).maybeSingle();
  if (existingPo) return; // retry after the PO was already created

  const origin = await purchaseRequestOrigin(prId);
  const pr = must(await db.from("purchase_requests").select("id, quantity, needed_by, deal_id").eq("id", prId).single(), "load PR");
  const quotes = must(
    await db
      .from("vendor_quotes")
      .select("id, vendor_id, unit_price, lead_time_days, companies(name)")
      .eq("purchase_request_id", prId)
      .eq("status", "received"),
    "load quotes",
  );
  if (quotes.length === 0) throw new Error(`no quotes received for purchase request ${prId}`);
  const personas = must(
    await db.from("vendor_personas").select("vendor_id, reliability").in("vendor_id", quotes.map((q) => q.vendor_id)),
    "load reliability",
  );
  const reliability = new Map(personas.map((p) => [p.vendor_id, Number(p.reliability)]));
  const daysUntilNeeded = Math.max(1, Math.round((new Date(origin.needed_by).getTime() - Date.now()) / 86_400_000));

  const scored = scoreQuotes(
    quotes.map((q) => ({
      vendor_id: q.vendor_id,
      vendor_name: (q.companies as { name: string } | null)?.name ?? q.vendor_id,
      unit_price: Number(q.unit_price),
      lead_time_days: q.lead_time_days,
      reliability: reliability.get(q.vendor_id) ?? 0.8,
    })),
    { daysUntilNeeded, targetUnitCost: origin.target_unit_cost },
  );
  const eligible = scored.filter((s) => s.eligible);
  const pool: ScoredQuote[] = eligible.length ? eligible : scored; // nothing meets the date: best effort
  const top = pool[0];

  const d = await decide(
    [
      { role: "system", content: PROCUREMENT_SYSTEM },
      {
        role: "user",
        content: `Purchase request: ${pr.quantity} units, needed by ${origin.needed_by} (${daysUntilNeeded} days), target $${origin.target_unit_cost}/unit.
Scored quotes (sorted, computed by code):
${json(scored.map(({ vendor_id, vendor_name, unit_price, lead_time_days, reliability, score, meets_deadline, within_target, eligible }) => ({ vendor_id, vendor_name, unit_price, lead_time_days, reliability, score, meets_deadline, within_target, eligible })))}
Choose the vendor.`,
      },
    ],
    selectTool(pool.map((q) => q.vendor_id)),
    () => ({
      vendor_id: top.vendor_id,
      rationale: `${top.vendor_name} has the best weighted score (${top.score}): $${top.unit_price}/unit, ${top.lead_time_days}-day lead time, reliability ${top.reliability}.`,
    }),
  );
  const winner = pool.find((q) => q.vendor_id === d.data.vendor_id) ?? top;
  const winnerQuote = quotes.find((q) => q.vendor_id === winner.vendor_id)!;

  await db.from("vendor_quotes").update({ status: "rejected" }).eq("purchase_request_id", prId).neq("id", winnerQuote.id);
  await db.from("vendor_quotes").update({ status: "selected" }).eq("id", winnerQuote.id);
  await db.from("purchase_requests").update({ status: "awarded" }).eq("id", prId);

  await recordStep({
    runId,
    agent: "procurement",
    action: "vendor.select",
    input: { purchase_request_id: prId, weights: { price: 0.5, lead: 0.2, reliability: 0.3 } },
    output: {
      selected: { vendor_id: winner.vendor_id, vendor_name: winner.vendor_name, unit_price: winner.unit_price, score: winner.score },
      scores: scored,
      overrode_top_score: winner.vendor_id !== top.vendor_id,
      fallback: d.fallbackReason,
    },
    rationale: d.data.rationale,
    llm: d.llm,
  });

  // P4: create the PO; above threshold it waits for a human.
  const policies = await loadPolicies();
  const amount = round2(winner.unit_price * pr.quantity);
  const needsApproval = amount >= policies.poApprovalThreshold;
  const poNumber = `PO-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
  const po = must(
    await db
      .from("purchase_orders")
      .insert({
        po_number: poNumber,
        purchase_request_id: prId,
        vendor_id: winner.vendor_id,
        amount,
        status: needsApproval ? "pending_approval" : "issued",
      })
      .select("id")
      .single(),
    "create PO",
  );
  await recordStep({
    runId,
    agent: "procurement",
    action: "po.create",
    input: { vendor_id: winner.vendor_id, unit_price: winner.unit_price, quantity: pr.quantity },
    output: { purchase_order_id: po.id, po_number: poNumber, amount, threshold: policies.poApprovalThreshold, needs_approval: needsApproval },
    rationale: needsApproval
      ? `${poNumber} for $${amount.toLocaleString("en-US")} is at or above the $${policies.poApprovalThreshold.toLocaleString("en-US")} approval threshold; waiting for an ops manager.`
      : `${poNumber} for $${amount.toLocaleString("en-US")} is under the approval threshold; issuing directly.`,
  });

  if (needsApproval) {
    await requestApproval({
      runId,
      agent: "procurement",
      subjectType: "purchase_order",
      subjectId: po.id,
      requiredRole: "ops_manager",
      amount,
      reason: `Issue ${poNumber} to ${winner.vendor_name}: ${pr.quantity} units at $${winner.unit_price} = $${amount.toLocaleString("en-US")}. ${d.data.rationale}`,
    });
  } else {
    await issuePo(runId, po.id);
  }
}

// P4 (after approval) + P6-lite. Sends the PO to the vendor, which will invoice it.
export async function issuePo(runId: string, poId: string) {
  const db = serviceDb();
  const ctx = await loadPoContext(poId);
  if (ctx.po.status === "pending_approval") {
    await db.from("purchase_orders").update({ status: "issued" }).eq("id", poId);
  } else if (ctx.po.status !== "issued") {
    return;
  }
  await recordStep({
    runId,
    agent: "procurement",
    action: "po.issue",
    input: { purchase_order_id: poId },
    output: { po_number: ctx.po.po_number, vendor: ctx.vendorName, amount: ctx.po.amount },
    rationale: `Issued ${ctx.po.po_number} to ${ctx.vendorName}.`,
  });

  const { data: receipt } = await db.from("goods_receipts").select("id").eq("purchase_order_id", poId).maybeSingle();
  if (!receipt) {
    await db.from("goods_receipts").insert({ purchase_order_id: poId, quantity: ctx.quantity, status: "received" });
    await recordStep({
      runId,
      agent: "procurement",
      action: "goods.receive",
      input: { purchase_order_id: poId },
      output: { quantity: ctx.quantity, status: "received", simulated: true, eta: addDays(new Date(), ctx.quote?.lead_time_days ?? 0).toISOString().slice(0, 10) },
      rationale: `Goods receipt recorded for ${ctx.quantity} units (simulated delivery).`,
    });
  }

  await emitHandoff({
    runId,
    from: "procurement",
    to: "finance",
    type: "vendor_invoice.expect",
    idempotencyKey: `${runId}:vendor_invoice.expect:${poId}`,
    dealId: ctx.pr.deal_id,
    purchaseRequestId: ctx.pr.id,
    purchaseOrderId: poId,
    payload: {
      purchase_order_id: poId,
      vendor_id: ctx.po.vendor_id,
      expected_unit_price: ctx.unitPrice,
      expected_quantity: ctx.quantity,
      expected_amount: ctx.po.amount,
    },
    rationale: `Expect an invoice from ${ctx.vendorName} for ${ctx.po.po_number}: ${ctx.quantity} x $${ctx.unitPrice}.`,
  });

  await generateVendorInvoice({ purchaseOrderId: poId, runId, supabase: db, enqueue: enqueueUnknown });
}

export async function cancelPo(runId: string, poId: string, note: string | null) {
  const db = serviceDb();
  await db.from("purchase_orders").update({ status: "cancelled" }).eq("id", poId);
  const ctx = await loadPoContext(poId);
  await db.from("purchase_requests").update({ status: "cancelled" }).eq("id", ctx.pr.id);
  await recordStep({
    runId,
    agent: "procurement",
    action: "po.cancel",
    input: { purchase_order_id: poId },
    output: { po_number: ctx.po.po_number, note },
    status: "flagged",
    rationale: `Approval rejected${note ? ` ("${note}")` : ""}; ${ctx.po.po_number} cancelled.`,
  });
}

const disputeTool = {
  name: "draft_dispute",
  description: "Draft the dispute message sent to the vendor.",
  schema: z.object({
    message: z.string().min(40).max(1200).describe("The message to the vendor"),
    rationale: z.string().min(10).max(400).describe("Why this dispute is justified, for the audit trail"),
  }),
};

// P5: Finance handed back a mismatched invoice.
export async function handleInvoiceAnomaly(runId: string, p: InvoiceAnomalyPayload) {
  const ctx = await loadPoContext(p.purchase_order_id);
  const quoted = ctx.quote?.unit_price ?? ctx.unitPrice;
  const facts = {
    po_number: ctx.po.po_number,
    vendor: ctx.vendorName,
    quoted_unit_price: quoted,
    invoiced_unit_price: p.actual_unit_price,
    unit_price_variance_pct: variancePct(quoted, p.actual_unit_price),
    ordered_quantity: ctx.quantity,
    invoiced_quantity: p.actual_quantity,
    overbilled_amount: round2((p.actual_unit_price - quoted) * p.actual_quantity),
    finance_reason: p.reason,
  };
  const confirmed = p.actual_unit_price > quoted || p.actual_quantity !== ctx.quantity;

  const d = await decide(
    [
      { role: "system", content: PROCUREMENT_SYSTEM },
      { role: "user", content: `Finance flagged the vendor invoice for ${ctx.po.po_number}. Facts from the original quote and PO (computed by code):\n${json(facts)}\nDraft the dispute.` },
    ],
    disputeTool,
    () => ({
      message: `Hello ${ctx.vendorName}, your invoice for ${ctx.po.po_number} bills ${p.actual_quantity} units at $${p.actual_unit_price}/unit, but your quote and our PO are at $${quoted}/unit (a $${facts.overbilled_amount.toLocaleString("en-US")} difference). Please send a corrected invoice at the quoted price.`,
      rationale: `Invoice is ${facts.unit_price_variance_pct}% above the quoted unit price.`,
    }),
  );

  await recordStep({
    runId,
    agent: "procurement",
    action: "invoice.dispute",
    input: { invoice_id: p.invoice_id, purchase_order_id: p.purchase_order_id },
    output: { ...facts, confirmed_against_quote: confirmed, dispute_message: d.data.message, fallback: d.fallbackReason },
    status: confirmed ? "ok" : "flagged",
    rationale: d.data.rationale,
    llm: d.llm,
  });
  await enqueue("vendor.dispute", {
    run_id: runId,
    purchase_order_id: p.purchase_order_id,
    invoice_id: p.invoice_id,
    reason: d.data.message,
  });
}

const correctionTool = {
  name: "review_corrected_invoice",
  description: "Record your review of the vendor's corrected invoice.",
  schema: z.object({ rationale: z.string().min(10).max(500) }),
};

// P5 (closing): the vendor answered the dispute with a corrected invoice.
export async function reviewCorrectedInvoice(runId: string, job: VendorInvoicePayload, extracted: ExtractedInvoice) {
  const db = serviceDb();
  const ctx = await loadPoContext(job.purchase_order_id);
  const policies = await loadPolicies();
  const quoted = ctx.quote?.unit_price ?? ctx.unitPrice;
  const f = extracted.fields;
  const priceVar = variancePct(quoted, f.unit_price);
  const acceptable = priceVar <= policies.matchTolerancePct && f.quantity === ctx.quantity;
  const originalId = job.corrects_invoice_id!;

  const d = await decide(
    [
      { role: "system", content: PROCUREMENT_SYSTEM },
      {
        role: "user",
        content: `The vendor replied to your dispute on ${ctx.po.po_number} with a corrected invoice.
Code comparison: quoted $${quoted}/unit, corrected invoice $${f.unit_price}/unit x ${f.quantity} (variance ${priceVar}%, tolerance ${policies.matchTolerancePct}%), acceptable=${acceptable}.
Vendor message:
${untrusted("vendor_message", job.vendor_message ?? "(none)")}
Record your review.`,
      },
    ],
    correctionTool,
    () => ({
      rationale: acceptable
        ? `Corrected invoice matches the quote ($${f.unit_price}/unit); forwarding to Finance for re-match.`
        : `Corrected invoice still differs from the quote ($${f.unit_price} vs $${quoted}); escalating.`,
    }),
  );

  await recordStep({
    runId,
    agent: "procurement",
    action: "invoice.review_correction",
    input: { corrects_invoice_id: originalId, file_path: job.file_path, invoice_number: job.invoice_number },
    output: { quoted_unit_price: quoted, corrected_unit_price: f.unit_price, corrected_quantity: f.quantity, variance_pct: priceVar, acceptable, vendor_message: job.vendor_message, fallback: d.fallbackReason },
    status: acceptable ? "ok" : "flagged",
    rationale: d.data.rationale,
    llm: d.llm,
  });
  if (!acceptable) throw new EscalationError(`corrected invoice for ${ctx.po.po_number} still mismatches the quote`);

  // Attach the corrected document to the disputed invoice; Finance re-matches it.
  await db
    .from("invoices")
    .update({ file_path: job.file_path, extracted: extracted as never, extraction_confidence: minConfidence(extracted) })
    .eq("id", originalId);

  const priorCorrections = must(
    await db.from("handoffs").select("id", { count: "exact", head: false }).eq("invoice_id", originalId).eq("type", "invoice.corrected"),
    "count corrections",
  ).length;
  await emitHandoff({
    runId,
    from: "procurement",
    to: "finance",
    type: "invoice.corrected",
    idempotencyKey: `${runId}:invoice.corrected:${originalId}:${job.invoice_number}`,
    dealId: ctx.pr.deal_id,
    purchaseOrderId: ctx.po.id,
    invoiceId: originalId,
    payload: {
      invoice_id: originalId,
      purchase_order_id: ctx.po.id,
      corrected_unit_price: f.unit_price,
      corrected_quantity: f.quantity,
      note: `Vendor corrected invoice ${job.invoice_number} (correction #${priorCorrections + 1}).`,
    },
    rationale: d.data.rationale,
  });
}

export function minConfidence(x: ExtractedInvoice): number {
  const vals = Object.values(x.confidence).filter((v): v is number => typeof v === "number");
  return vals.length ? Math.min(...vals) : 0;
}
