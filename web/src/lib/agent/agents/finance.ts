// Finance Agent: F1 (customer invoice), F2 (ingest + match vendor invoice), F3 (flag anomalies and
// hand back to Procurement), F4 (schedule payments behind approval), F5-lite (customer paid/overdue),
// F6 via extractInvoice() from Sim-world.
import { z } from "zod";
import type {
  CustomerInvoiceCreatePayload,
  CustomerPaidPayload,
  InvoiceCorrectedPayload,
  VendorInvoiceExpectPayload,
  VendorInvoicePayload,
} from "@/lib/contracts";
import { requestApproval } from "../approvals";
import { addDays, isoDate, must, round2, serviceDb } from "../db";
import { loadPoContext, receivedQuantity } from "../entities";
import { emitHandoff } from "../handoffs";
import { completeRun, recordStep } from "../ledger";
import { decide, json } from "../llm";
import { loadPolicies } from "../policies";
import { FINANCE_SYSTEM } from "../prompts/finance";
import { enqueue } from "../queue";
import { threeWayMatch } from "../rules";
import { extractInvoice } from "../sim-bridge";
import { minConfidence } from "./procurement";

const LOW_CONFIDENCE = 0.7;

function invoiceNumber(prefix: string) {
  return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
}

// F1
export async function issueCustomerInvoice(runId: string, p: CustomerInvoiceCreatePayload) {
  const db = serviceDb();
  const { data: existing } = await db
    .from("invoices")
    .select("id")
    .eq("deal_id", p.deal_id)
    .eq("direction", "receivable")
    .maybeSingle();
  let invoiceId = existing?.id;
  if (!invoiceId) {
    const number = invoiceNumber("INV");
    invoiceId = must(
      await db
        .from("invoices")
        .insert({ invoice_number: number, direction: "receivable", deal_id: p.deal_id, amount: p.amount, due_date: p.due_date, status: "pending" })
        .select("id")
        .single(),
      "create receivable",
    ).id;
    await recordStep({
      runId,
      agent: "finance",
      action: "customer_invoice.issue",
      input: p,
      output: { invoice_id: invoiceId, invoice_number: number, amount: p.amount, due_date: p.due_date },
      rationale: `Issued customer invoice ${number} for $${p.amount.toLocaleString("en-US")}, due ${p.due_date}.`,
    });
  }
  // W4: the simulated customer settles a few seconds later (P1).
  const run = must(await db.from("agent_runs").select("options").eq("id", runId).single(), "load run");
  const late = (run.options as Record<string, unknown>)?.customer_late === true;
  await enqueue("customer.payment", { run_id: runId, invoice_id: invoiceId, on_time: !late }, { delayMs: 2_000 });
}

export async function expectVendorInvoice(runId: string, p: VendorInvoiceExpectPayload) {
  await recordStep({
    runId,
    agent: "finance",
    action: "vendor_invoice.expect",
    input: p,
    output: { purchase_order_id: p.purchase_order_id, expected_amount: p.expected_amount },
    rationale: `Watching for the vendor invoice: ${p.expected_quantity} x $${p.expected_unit_price} = $${p.expected_amount.toLocaleString("en-US")}.`,
  });
}

// F2 + F6: a vendor sent an invoice document.
export async function ingestVendorInvoice(runId: string, job: VendorInvoicePayload) {
  const db = serviceDb();
  const { data: existing } = await db.from("invoices").select("id, status").eq("file_path", job.file_path).maybeSingle();
  if (existing) {
    if (existing.status === "pending") await matchInvoice(runId, existing.id);
    return;
  }

  const x = await extractInvoice(job.file_path);
  const conf = minConfidence(x);
  const f = x.fields;
  await recordStep({
    runId,
    agent: "finance",
    action: "invoice.extract",
    input: { file_path: job.file_path, invoice_number: job.invoice_number },
    output: { fields: f, confidence: x.confidence, min_confidence: conf },
    status: conf < LOW_CONFIDENCE ? "flagged" : "ok",
    rationale: `Read invoice ${f.invoice_number || job.invoice_number}: ${f.quantity} x $${f.unit_price} = $${f.total} (min field confidence ${conf}).`,
    llm: { model: x.model, latencyMs: x.latencyMs, tokensIn: 0, tokensOut: 0 },
  });

  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(f.due_date) ? f.due_date : isoDate(addDays(new Date(), 30));
  const invoice = must(
    await db
      .from("invoices")
      .insert({
        invoice_number: f.invoice_number || job.invoice_number,
        direction: "payable",
        purchase_order_id: job.purchase_order_id,
        vendor_id: job.vendor_id,
        amount: round2(f.total),
        unit_price: f.unit_price,
        quantity: f.quantity,
        due_date: dueDate,
        status: "pending",
        file_path: job.file_path,
        extracted: x as never,
        extraction_confidence: conf,
      })
      .select("id")
      .single(),
    "create payable",
  );

  if (conf < LOW_CONFIDENCE) {
    await requestApproval({
      runId,
      agent: "finance",
      subjectType: "invoice_correction",
      subjectId: invoice.id,
      requiredRole: "finance_controller",
      amount: round2(f.total),
      reason: `Low-confidence extraction (min ${conf}) on invoice ${f.invoice_number}; please verify the fields before matching.`,
    });
    return;
  }
  await matchInvoice(runId, invoice.id);
}

const matchTool = {
  name: "report_match",
  description: "Report the 3-way match result for the audit trail.",
  schema: z.object({
    summary: z.string().min(10).max(600).describe("Plain-language result citing the provided numbers"),
    anomaly_reason: z.string().max(600).optional().describe("Required when there are issues: what is wrong, for Procurement"),
  }),
};

// F2 + F3: code decides matched/anomaly; the model explains.
export async function matchInvoice(runId: string, invoiceId: string) {
  const db = serviceDb();
  const inv = must(
    await db.from("invoices").select("id, invoice_number, purchase_order_id, vendor_id, unit_price, quantity, amount, status, extracted").eq("id", invoiceId).single(),
    "load invoice",
  );
  if (inv.status === "matched" || inv.status === "paid") return;
  const policies = await loadPolicies();
  const ctx = inv.purchase_order_id ? await loadPoContext(inv.purchase_order_id) : null;
  const received = ctx ? await receivedQuantity(ctx.po.id) : 0;
  const { data: dupes } = await db
    .from("invoices")
    .select("id")
    .eq("direction", "payable")
    .eq("vendor_id", inv.vendor_id!)
    .eq("invoice_number", inv.invoice_number)
    .neq("id", inv.id);
  const extractedVendor = (inv.extracted as { fields?: { vendor_name?: string } } | null)?.fields?.vendor_name;
  const vendorOk = !ctx || !extractedVendor || extractedVendor.toLowerCase() === ctx.vendorName.toLowerCase();

  const invoiceUnit = Number(inv.unit_price);
  const invoiceQty = Number(inv.quantity);
  const result = threeWayMatch({
    po: ctx ? { unit_price: ctx.unitPrice, quantity: ctx.quantity, vendor_id: ctx.po.vendor_id } : null,
    receivedQuantity: received,
    invoice: {
      unit_price: invoiceUnit,
      quantity: invoiceQty,
      total: Number(inv.amount),
      vendor_id: vendorOk ? (inv.vendor_id ?? "") : `name:${extractedVendor}`,
    },
    tolerancePct: policies.matchTolerancePct,
    duplicate: (dupes ?? []).length > 0,
  });

  const facts = {
    invoice: inv.invoice_number,
    po: ctx ? { po_number: ctx.po.po_number, vendor: ctx.vendorName, unit_price: ctx.unitPrice, quantity: ctx.quantity } : null,
    goods_received: received,
    invoiced: { unit_price: invoiceUnit, quantity: invoiceQty, total: Number(inv.amount) },
    tolerance_pct: policies.matchTolerancePct,
    matched: result.matched,
    issues: result.issues,
  };
  const issueText = result.issues
    .map((i) => `${i.code.replace(/_/g, " ")}: expected ${i.expected}, got ${i.actual}${i.variance_pct !== undefined ? ` (${i.variance_pct}%)` : ""}`)
    .join("; ");
  const d = await decide(
    [
      { role: "system", content: FINANCE_SYSTEM },
      { role: "user", content: `3-way match result (computed by code):\n${json(facts)}\nReport it.` },
    ],
    matchTool,
    () => ({
      summary: result.matched
        ? `Invoice ${inv.invoice_number} matches ${ctx?.po.po_number}: ${invoiceQty} x $${invoiceUnit} against PO and goods receipt, within ${policies.matchTolerancePct}% tolerance.`
        : `Invoice ${inv.invoice_number} does not match ${ctx?.po.po_number ?? "any PO"}: ${issueText}.`,
      anomaly_reason: result.matched ? undefined : issueText,
    }),
  );

  await db.from("invoices").update({ status: result.matched ? "matched" : "anomaly" }).eq("id", inv.id);
  await recordStep({
    runId,
    agent: "finance",
    action: "invoice.match",
    input: { invoice_id: inv.id, purchase_order_id: inv.purchase_order_id },
    output: { ...facts, fallback: d.fallbackReason },
    status: result.matched ? "ok" : "flagged",
    rationale: d.data.summary,
    llm: d.llm,
  });

  if (result.matched) {
    await schedulePayment(runId, inv.id);
    return;
  }
  if (!ctx) return; // unknown PO: nothing Procurement can dispute; stays flagged for a human

  await emitHandoff({
    runId,
    from: "finance",
    to: "procurement",
    type: "invoice.anomaly",
    idempotencyKey: `${runId}:invoice.anomaly:${inv.id}:${invoiceUnit}:${invoiceQty}`,
    dealId: ctx.pr.deal_id,
    purchaseOrderId: ctx.po.id,
    invoiceId: inv.id,
    payload: {
      invoice_id: inv.id,
      purchase_order_id: ctx.po.id,
      reason: d.data.anomaly_reason || issueText,
      expected_unit_price: ctx.unitPrice,
      actual_unit_price: invoiceUnit,
      expected_quantity: ctx.quantity,
      actual_quantity: invoiceQty,
    },
    rationale: d.data.anomaly_reason || issueText,
  });
}

// Procurement resolved the dispute: apply the corrected figures and re-match.
export async function rematchInvoice(runId: string, p: InvoiceCorrectedPayload) {
  const db = serviceDb();
  const before = must(await db.from("invoices").select("unit_price, quantity, amount, status").eq("id", p.invoice_id).single(), "load invoice");
  if (before.status === "matched" || before.status === "paid") return;
  const amount = round2(p.corrected_unit_price * p.corrected_quantity);
  await db
    .from("invoices")
    .update({ unit_price: p.corrected_unit_price, quantity: p.corrected_quantity, amount, status: "pending" })
    .eq("id", p.invoice_id);
  await recordStep({
    runId,
    agent: "finance",
    action: "invoice.apply_correction",
    input: p,
    output: { before: { unit_price: Number(before.unit_price), quantity: before.quantity, amount: Number(before.amount) }, after: { unit_price: p.corrected_unit_price, quantity: p.corrected_quantity, amount } },
    rationale: `Applied the vendor's correction ($${Number(before.unit_price)} -> $${p.corrected_unit_price}/unit); re-running the 3-way match.`,
  });
  await matchInvoice(runId, p.invoice_id);
}

// F4: every payment waits for a finance controller.
async function schedulePayment(runId: string, invoiceId: string) {
  const db = serviceDb();
  const inv = must(await db.from("invoices").select("invoice_number, amount").eq("id", invoiceId).single(), "load invoice");
  const { data: existing } = await db.from("payments").select("id").eq("invoice_id", invoiceId).eq("status", "scheduled").maybeSingle();
  const paymentId =
    existing?.id ??
    must(await db.from("payments").insert({ invoice_id: invoiceId, amount: inv.amount, status: "scheduled" }).select("id").single(), "create payment").id;
  await recordStep({
    runId,
    agent: "finance",
    action: "payment.schedule",
    input: { invoice_id: invoiceId },
    output: { payment_id: paymentId, amount: Number(inv.amount) },
    rationale: `Scheduled payment of $${Number(inv.amount).toLocaleString("en-US")} for ${inv.invoice_number}; payments always need a finance controller's approval.`,
  });
  await requestApproval({
    runId,
    agent: "finance",
    subjectType: "payment",
    subjectId: paymentId,
    requiredRole: "finance_controller",
    amount: Number(inv.amount),
    reason: `Pay ${inv.invoice_number}: $${Number(inv.amount).toLocaleString("en-US")}, 3-way matched.`,
  });
}

export async function onPaymentDecided(runId: string, paymentId: string, approved: boolean, note: string | null) {
  const db = serviceDb();
  const pay = must(await db.from("payments").select("id, invoice_id, amount, status").eq("id", paymentId).single(), "load payment");
  if (pay.status !== "scheduled") return;
  if (approved) {
    await db.from("payments").update({ status: "sent", paid_at: new Date().toISOString() }).eq("id", paymentId);
    await db.from("invoices").update({ status: "paid" }).eq("id", pay.invoice_id);
  } else {
    await db.from("payments").update({ status: "failed" }).eq("id", paymentId);
  }
  await recordStep({
    runId,
    agent: "finance",
    action: approved ? "payment.send" : "payment.reject",
    input: { payment_id: paymentId },
    output: { amount: Number(pay.amount), status: approved ? "sent" : "failed", note },
    status: approved ? "ok" : "flagged",
    rationale: approved
      ? `Payment of $${Number(pay.amount).toLocaleString("en-US")} approved and sent.`
      : `Payment rejected by the controller${note ? `: "${note}"` : ""}.`,
  });
  await checkRunComplete(runId);
}

// F5-lite: the simulated customer paid, or the receivable went overdue.
export async function handleCustomerPaid(runId: string, p: CustomerPaidPayload) {
  const db = serviceDb();
  const inv = must(await db.from("invoices").select("id, deal_id, amount, due_date, invoice_number").eq("id", p.invoiceId).single(), "load receivable");
  if (!inv.deal_id) return;
  if (p.status === "paid") {
    await recordStep({
      runId,
      agent: "finance",
      action: "receivable.collected",
      input: p,
      output: { invoice_id: inv.id, amount: Number(inv.amount) },
      rationale: `Customer paid ${inv.invoice_number} ($${Number(inv.amount).toLocaleString("en-US")}).`,
    });
    await emitHandoff({
      runId,
      from: "finance",
      to: "sales",
      type: "payment.status",
      idempotencyKey: `${runId}:payment.status:${inv.id}`,
      dealId: inv.deal_id,
      invoiceId: inv.id,
      payload: { deal_id: inv.deal_id, invoice_id: inv.id, status: "sent", amount: Number(inv.amount), paid_at: new Date().toISOString() },
      rationale: `Tell Sales the customer paid.`,
    });
  } else {
    const days = Math.max(1, Math.round((Date.now() - new Date(inv.due_date).getTime()) / 86_400_000));
    await recordStep({
      runId,
      agent: "finance",
      action: "receivable.follow_up",
      input: p,
      output: {
        invoice_id: inv.id,
        days_overdue: days,
        draft: `Hello, our records show invoice ${inv.invoice_number} for $${Number(inv.amount).toLocaleString("en-US")} is past due. Could you confirm the payment date?`,
      },
      status: "flagged",
      rationale: `Receivable ${inv.invoice_number} is overdue; drafted a follow-up and notified Sales.`,
    });
    await emitHandoff({
      runId,
      from: "finance",
      to: "sales",
      type: "receivable.overdue",
      idempotencyKey: `${runId}:receivable.overdue:${inv.id}`,
      dealId: inv.deal_id,
      invoiceId: inv.id,
      payload: { deal_id: inv.deal_id, invoice_id: inv.id, days_overdue: days, amount: Number(inv.amount) },
    });
  }
}

/**
 * A run is complete when every vendor invoice for its deal is paid and the customer receivable has
 * been settled (paid, or overdue and handed to Sales).
 */
export async function checkRunComplete(runId: string) {
  const db = serviceDb();
  const { data: h } = await db.from("handoffs").select("deal_id").eq("run_id", runId).not("deal_id", "is", null).limit(1).maybeSingle();
  if (!h?.deal_id) return false;
  const { data: prs } = await db.from("purchase_requests").select("id").eq("deal_id", h.deal_id);
  const { data: pos } = await db.from("purchase_orders").select("id").in("purchase_request_id", (prs ?? []).map((p) => p.id)).neq("status", "cancelled");
  const poIds = (pos ?? []).map((p) => p.id);
  if (!poIds.length) return false;
  const { data: payables } = await db.from("invoices").select("status").eq("direction", "payable").in("purchase_order_id", poIds);
  const { data: receivable } = await db.from("invoices").select("status").eq("direction", "receivable").eq("deal_id", h.deal_id).maybeSingle();
  const { data: openHandoffs } = await db.from("handoffs").select("id").eq("run_id", runId).in("status", ["pending", "processing"]);

  const payablesDone = (payables ?? []).length > 0 && (payables ?? []).every((i) => i.status === "paid");
  const receivableDone = receivable?.status === "paid" || receivable?.status === "overdue";
  if (payablesDone && receivableDone && (openHandoffs ?? []).length === 0) {
    if (!(await completeRun(runId, "completed"))) return true;
    await recordStep({
      runId,
      agent: "orchestrator",
      action: "run.complete",
      output: { deal_id: h.deal_id },
      rationale: "Vendor paid and customer receivable settled: deal fulfilled and collected.",
    });
    return true;
  }
  return false;
}
