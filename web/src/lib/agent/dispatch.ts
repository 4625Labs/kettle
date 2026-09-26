// Job kind -> handler. Shared by the worker process and the in-process eval.
import { JOB_KINDS, parseJobPayload, type JobKind } from "@/lib/contracts";
import * as finance from "./agents/finance";
import * as procurement from "./agents/procurement";
import { serviceDb } from "./db";
import { completeRun, recordStep, startRun } from "./ledger";
import * as orchestrator from "./orchestrator";
import { enqueueUnknown, type JobRow } from "./queue";
import { simHandlers, type SimJob, type SimJobHandler } from "./sim-bridge";

type Handler = (job: JobRow) => Promise<void>;

async function runSim(kind: "vendor.rfq" | "vendor.dispute" | "customer.payment", job: JobRow) {
  const h = simHandlers[kind] as SimJobHandler | undefined;
  if (!h) throw new Error(`no Sim-world handler registered for ${kind}`);
  const simJob = { id: job.id, kind, payload: parseJobPayload(kind, job.payload) } as SimJob;
  await h(simJob, { supabase: serviceDb(), enqueue: async (k, payload) => void (await enqueueUnknown(k, payload)) });
}

const HANDLERS: Record<JobKind, Handler> = {
  "run.start": async (job) => {
    const p = parseJobPayload("run.start", job.payload);
    if (!p.deal_id) throw new Error("run.start needs a deal_id");
    const db = serviceDb();
    // Idempotent across retries: the run row remembers the job that created it.
    const { data: prior } = await db.from("agent_runs").select("id").contains("options", { job_id: job.id }).maybeSingle();
    const runId =
      prior?.id ??
      (await startRun({ goal: p.goal, agent: "orchestrator", options: { job_id: job.id, deal_id: p.deal_id, inject_anomaly: p.inject_anomaly === true } })).id;
    await orchestrator.onDealWon(runId, p.deal_id);
  },

  "handoff.process": async (job) => {
    await orchestrator.processHandoff(parseJobPayload("handoff.process", job.payload).handoff_id);
  },

  // Sim-world writes the quotes; Procurement continues once they are in.
  "vendor.rfq": async (job) => {
    const p = parseJobPayload("vendor.rfq", job.payload);
    await runSim("vendor.rfq", job);
    await procurement.selectVendor(p.run_id, p.purchase_request_id);
  },

  "vendor.dispute": async (job) => {
    await runSim("vendor.dispute", job);
  },

  "vendor.invoice": async (job) => {
    await orchestrator.onVendorInvoice(parseJobPayload("vendor.invoice", job.payload));
  },

  "customer.payment": async (job) => {
    await runSim("customer.payment", job);
  },

  "customer.paid": async (job) => {
    const p = parseJobPayload("customer.paid", job.payload);
    const runId = p.runId ?? (await runIdForInvoice(p.invoiceId));
    if (!runId) throw new Error(`customer.paid: no run for invoice ${p.invoiceId}`);
    await finance.handleCustomerPaid(runId, p);
  },

  "approval.decided": async (job) => {
    await orchestrator.onApprovalDecided(parseJobPayload("approval.decided", job.payload).approval_id);
  },
};

export function isKnownKind(kind: string): kind is JobKind {
  return (JOB_KINDS as readonly string[]).includes(kind);
}

export async function runJob(job: JobRow) {
  if (!isKnownKind(job.kind)) throw new Error(`unknown job kind "${job.kind}"`);
  await HANDLERS[job.kind](job);
}

/** Best-effort run id for a job, used to log escalations on the right run. */
export async function runIdForJob(job: JobRow): Promise<string | null> {
  const p = (job.payload ?? {}) as Record<string, unknown>;
  if (typeof p.run_id === "string") return p.run_id;
  if (typeof p.runId === "string") return p.runId;
  const db = serviceDb();
  if (typeof p.handoff_id === "string") {
    const { data } = await db.from("handoffs").select("run_id").eq("id", p.handoff_id).maybeSingle();
    return data?.run_id ?? null;
  }
  if (typeof p.approval_id === "string") {
    const { data } = await db.from("approvals").select("run_id").eq("id", p.approval_id).maybeSingle();
    return data?.run_id ?? null;
  }
  if (job.kind === "run.start") {
    const { data } = await db.from("agent_runs").select("id").contains("options", { job_id: job.id }).maybeSingle();
    return data?.id ?? null;
  }
  return null;
}

async function runIdForInvoice(invoiceId: string): Promise<string | null> {
  const { data } = await serviceDb().from("handoffs").select("run_id").eq("invoice_id", invoiceId).limit(1).maybeSingle();
  if (data?.run_id) return data.run_id;
  const { data: inv } = await serviceDb().from("invoices").select("deal_id").eq("id", invoiceId).maybeSingle();
  if (!inv?.deal_id) return null;
  const { data: h } = await serviceDb().from("handoffs").select("run_id").eq("deal_id", inv.deal_id).limit(1).maybeSingle();
  return h?.run_id ?? null;
}

/** K6: a job failed for good (or an agent escalated). Mark the handoff and run failed, log it. */
export async function escalate(job: JobRow, err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const runId = await runIdForJob(job).catch(() => null);
  const p = (job.payload ?? {}) as Record<string, unknown>;
  if (typeof p.handoff_id === "string") {
    await serviceDb().from("handoffs").update({ status: "failed", processed_at: new Date().toISOString() }).eq("id", p.handoff_id);
  }
  if (!runId) return;
  await recordStep({
    runId,
    agent: "orchestrator",
    action: "escalate",
    input: { job_id: job.id, kind: job.kind, attempts: job.attempts },
    output: { error: message },
    status: "error",
    rationale: `Could not complete ${job.kind} after ${job.attempts} attempt(s); a human needs to look at this: ${message}`,
  }).catch(() => undefined);
  await completeRun(runId, "failed").catch(() => undefined);
}
