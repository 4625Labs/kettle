// AI orchestrator (K2). Every handoff and external event comes through here; the model picks an
// (agent, action) route, code validates it against a static allow-list, and only then runs the
// agent. Agents never call each other directly. Step cap + loop detection escalate to a human (K6).
import { z } from "zod";
import {
  HANDOFF_ALLOW_LIST,
  parseHandoffPayload,
  type Agent,
  type HandoffType,
  type VendorInvoicePayload,
} from "@/lib/contracts";
import * as finance from "./agents/finance";
import * as procurement from "./agents/procurement";
import * as sales from "./agents/sales";
import { must, serviceDb } from "./db";
import { EscalationError } from "./errors";
import { completeRun, recordStep } from "./ledger";
import { decide, json } from "./llm";
import { loadPolicies } from "./policies";
import { ORCHESTRATOR_SYSTEM } from "./prompts/orchestrator";
import { extractInvoice } from "./sim-bridge";

export type EventType = HandoffType | "deal.won" | "vendor_invoice.received" | "vendor_invoice.corrected";

interface Route {
  agent: Exclude<Agent, "orchestrator">;
  action: string;
  purpose: string;
}

// The allow-list. Handoff routes must also agree with HANDOFF_ALLOW_LIST's to_agent (checked below).
export const ROUTES: Record<EventType, Route> = {
  "deal.won": { agent: "sales", action: "validate_won_deal", purpose: "validate a won deal and hand off fulfillment + billing" },
  "purchase_request.create": { agent: "procurement", action: "handle_purchase_request", purpose: "open a purchase request and send RFQs" },
  "customer_invoice.create": { agent: "finance", action: "issue_customer_invoice", purpose: "bill the customer" },
  "vendor_invoice.expect": { agent: "finance", action: "expect_vendor_invoice", purpose: "record that a vendor invoice is coming for a PO" },
  "vendor_invoice.received": { agent: "finance", action: "ingest_vendor_invoice", purpose: "extract and 3-way match a new vendor invoice" },
  "invoice.anomaly": { agent: "procurement", action: "handle_invoice_anomaly", purpose: "check the quote and dispute a mismatched invoice with the vendor" },
  "vendor_invoice.corrected": { agent: "procurement", action: "review_corrected_invoice", purpose: "review the vendor's corrected invoice after a dispute" },
  "invoice.corrected": { agent: "finance", action: "rematch_invoice", purpose: "apply a vendor correction and re-match" },
  "payment.status": { agent: "sales", action: "record_payment_status", purpose: "reflect a customer payment on the deal" },
  "receivable.overdue": { agent: "sales", action: "handle_overdue", purpose: "flag an overdue customer on the deal" },
};

for (const [type, allowed] of Object.entries(HANDOFF_ALLOW_LIST)) {
  if (ROUTES[type as HandoffType].agent !== allowed.to) {
    throw new Error(`orchestrator allow-list disagrees with HANDOFF_ALLOW_LIST for ${type}`);
  }
}

const routeKey = (r: Pick<Route, "agent" | "action">) => `${r.agent}.${r.action}`;
const ALL_ROUTE_KEYS = [...new Set(Object.values(ROUTES).map(routeKey))] as [string, ...string[]];
const LOOP_LIMIT = 3;

const routeTool = {
  name: "route",
  description: "Route the event to one allowed agent action.",
  schema: z.object({
    route: z.enum(ALL_ROUTE_KEYS).describe("agent.action"),
    rationale: z.string().min(5).max(300),
  }),
};

/**
 * Asks the model to route an event, validates the choice, logs it. Returns the allowed route.
 * `eventKey` identifies the event so a retried job reuses its earlier routing step.
 */
async function routeEvent(runId: string, event: EventType, eventKey: string, summary: Record<string, unknown>): Promise<Route> {
  const db = serviceDb();
  const allowed = ROUTES[event];
  const { data: prior } = await db
    .from("agent_steps")
    .select("id")
    .eq("run_id", runId)
    .eq("action", "route")
    .eq("input->>event_key", eventKey)
    .limit(1)
    .maybeSingle();
  if (prior) return allowed;

  const policies = await loadPolicies();
  const { count } = await db
    .from("agent_steps")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("agent", "orchestrator")
    .eq("action", "route");
  if ((count ?? 0) >= policies.maxSteps) {
    throw new EscalationError(`step cap reached: ${count} routing decisions in this run (max_steps ${policies.maxSteps})`);
  }

  const d = await decide(
    [
      { role: "system", content: ORCHESTRATOR_SYSTEM },
      {
        role: "user",
        content: `Event: ${event}\nDetails:\n${json(summary)}\nAllowed routes:\n${Object.entries(ROUTES)
          .map(([e, r]) => `- ${routeKey(r)}: ${r.purpose} (for ${e})`)
          .join("\n")}`,
      },
    ],
    routeTool,
    () => ({ route: routeKey(allowed), rationale: `${event} goes to ${allowed.agent} to ${allowed.purpose}.` }),
    { timeoutMs: 15_000 },
  );
  const chosenOk = d.data.route === routeKey(allowed);

  await recordStep({
    runId,
    agent: "orchestrator",
    action: "route",
    input: { event, event_key: eventKey, ...summary },
    output: {
      route: routeKey(allowed),
      to_agent: allowed.agent,
      model_choice: d.data.route,
      allow_listed: chosenOk,
      fallback: d.fallbackReason,
    },
    status: chosenOk ? "ok" : "flagged",
    rationale: chosenOk
      ? d.data.rationale
      : `Model proposed ${d.data.route}, which is not allowed for ${event}; enforced allow-listed route ${routeKey(allowed)}.`,
    llm: d.llm,
  });
  return allowed;
}

// --- Handoffs --------------------------------------------------------------------------------

export async function processHandoff(handoffId: string) {
  const db = serviceDb();
  const h = must(await db.from("handoffs").select("*").eq("id", handoffId).single(), "load handoff");
  if (h.status === "done" || h.status === "failed" || h.status === "rejected") return; // K5: at most once
  if (!h.run_id) throw new EscalationError(`handoff ${handoffId} has no run`);
  const runId = h.run_id;
  const type = h.type as HandoffType;

  // Loop detection: the same handoff bouncing between the same agents too often.
  const { count: repeats } = await db
    .from("handoffs")
    .select("id", { count: "exact", head: true })
    .eq("run_id", runId)
    .eq("type", type)
    .eq("from_agent", h.from_agent)
    .eq("to_agent", h.to_agent);
  if ((repeats ?? 0) > LOOP_LIMIT) {
    throw new EscalationError(`loop detected: ${repeats} "${type}" handoffs ${h.from_agent} -> ${h.to_agent} in this run`);
  }

  await db.from("handoffs").update({ status: "processing" }).eq("id", handoffId).in("status", ["pending", "processing"]);
  const payload = parseHandoffPayload(type, h.payload);
  const route = await routeEvent(runId, type, `handoff:${handoffId}`, { handoff_id: handoffId, from: h.from_agent, to: h.to_agent, payload });

  switch (routeKey(route)) {
    case "procurement.handle_purchase_request":
      await procurement.handlePurchaseRequest(runId, handoffId, parseHandoffPayload("purchase_request.create", h.payload));
      break;
    case "finance.issue_customer_invoice":
      await finance.issueCustomerInvoice(runId, parseHandoffPayload("customer_invoice.create", h.payload));
      break;
    case "finance.expect_vendor_invoice":
      await finance.expectVendorInvoice(runId, parseHandoffPayload("vendor_invoice.expect", h.payload));
      break;
    case "procurement.handle_invoice_anomaly":
      await procurement.handleInvoiceAnomaly(runId, parseHandoffPayload("invoice.anomaly", h.payload));
      break;
    case "finance.rematch_invoice":
      await finance.rematchInvoice(runId, parseHandoffPayload("invoice.corrected", h.payload));
      break;
    case "sales.record_payment_status":
      await sales.recordPaymentStatus(runId, parseHandoffPayload("payment.status", h.payload));
      break;
    case "sales.handle_overdue":
      await sales.handleOverdue(runId, parseHandoffPayload("receivable.overdue", h.payload));
      break;
    default:
      throw new EscalationError(`no handler for route ${routeKey(route)}`);
  }

  await db.from("handoffs").update({ status: "done", processed_at: new Date().toISOString() }).eq("id", handoffId);
  await finance.checkRunComplete(runId);
}

// --- External events -------------------------------------------------------------------------

export async function onDealWon(runId: string, dealId: string) {
  const route = await routeEvent(runId, "deal.won", `deal.won:${dealId}`, { deal_id: dealId });
  if (routeKey(route) !== "sales.validate_won_deal") throw new EscalationError("unexpected route for deal.won");
  const res = await sales.validateWonDeal(runId, dealId);
  if (!res.ok) throw new EscalationError(`deal ${dealId} failed validation`);
}

export async function onVendorInvoice(job: VendorInvoicePayload) {
  const runId = job.run_id;
  const event: EventType = job.corrects_invoice_id ? "vendor_invoice.corrected" : "vendor_invoice.received";
  const route = await routeEvent(runId, event, `vendor.invoice:${job.file_path}`, {
    purchase_order_id: job.purchase_order_id,
    invoice_number: job.invoice_number,
    corrects_invoice_id: job.corrects_invoice_id,
  });
  if (routeKey(route) === "procurement.review_corrected_invoice") {
    const extracted = await extractInvoice(job.file_path);
    await procurement.reviewCorrectedInvoice(runId, job, extracted);
  } else {
    await finance.ingestVendorInvoice(runId, job);
  }
}

// --- Approvals (K4 resume) -------------------------------------------------------------------

export async function onApprovalDecided(approvalId: string) {
  const db = serviceDb();
  const a = must(await db.from("approvals").select("*").eq("id", approvalId).single(), "load approval");
  if (a.status === "pending") throw new Error(`approval ${approvalId} is still pending`);
  if (!a.run_id) throw new EscalationError(`approval ${approvalId} has no run`);
  const approved = a.status === "approved";
  const agent = a.requested_by_agent as Agent;

  await recordStep({
    runId: a.run_id,
    agent,
    action: "approval.resume",
    input: { approval_id: approvalId, subject_type: a.subject_type, subject_id: a.subject_id },
    output: { decision: a.status, decided_by: a.decided_by, note: a.note },
    status: approved ? "ok" : "flagged",
    rationale: `Human ${a.status} ${a.subject_type.replace("_", " ")}${a.note ? `: "${a.note}"` : ""}; resuming.`,
  });

  switch (a.subject_type) {
    case "purchase_order":
      if (approved) await procurement.issuePo(a.run_id, a.subject_id);
      else await procurement.cancelPo(a.run_id, a.subject_id, a.note);
      break;
    case "payment":
      await finance.onPaymentDecided(a.run_id, a.subject_id, approved, a.note);
      break;
    case "invoice_correction":
      if (approved) await finance.matchInvoice(a.run_id, a.subject_id);
      break;
  }
  // A human said no: this run can't reach its goal. End it so the UI doesn't show it as live.
  if (!approved && (await completeRun(a.run_id, "failed"))) {
    await recordStep({
      runId: a.run_id,
      agent: "orchestrator",
      action: "run.stopped",
      output: { approval_id: approvalId, subject_type: a.subject_type },
      status: "flagged",
      rationale: `Run stopped: a human rejected the ${a.subject_type.replace("_", " ")}.`,
    });
  }
}
