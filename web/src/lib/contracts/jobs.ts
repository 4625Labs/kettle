import { z } from "zod";
import { jobKindSchema, uuidSchema, type JobKind } from "./enums";

// --- Job payloads, one per kind in JOB_KINDS ---------------------------------------------------

// Kick off a new agent run for a goal (e.g. a deal was marked won).
export const runStartPayload = z.object({
  agent: z.enum(["sales", "procurement", "finance", "orchestrator"]),
  goal: z.string(),
  deal_id: uuidSchema.optional(),
  // W3: make the selected vendor overbill on its first invoice (stored in agent_runs.options).
  inject_anomaly: z.boolean().optional(),
});
export type RunStartPayload = z.infer<typeof runStartPayload>;

// The orchestrator processing one pending handoff row.
export const handoffProcessPayload = z.object({
  handoff_id: uuidSchema,
});
export type HandoffProcessPayload = z.infer<typeof handoffProcessPayload>;

// Procurement requesting quotes from simulated vendors (W2).
export const vendorRfqPayload = z.object({
  purchase_request_id: uuidSchema,
  vendor_ids: z.array(uuidSchema).min(1),
});
export type VendorRfqPayload = z.infer<typeof vendorRfqPayload>;

// Procurement disputing a mismatched vendor invoice (P5).
export const vendorDisputePayload = z.object({
  purchase_order_id: uuidSchema,
  invoice_id: uuidSchema,
  reason: z.string(),
});
export type VendorDisputePayload = z.infer<typeof vendorDisputePayload>;

// Simulated vendor generating an invoice PDF for a PO (W5); inject_anomaly drives the demo twist (W3).
export const vendorInvoicePayload = z.object({
  purchase_order_id: uuidSchema,
  vendor_id: uuidSchema,
  inject_anomaly: z.boolean().optional(),
});
export type VendorInvoicePayload = z.infer<typeof vendorInvoicePayload>;

// Simulated customer paying (or not paying) a receivable invoice (W4).
export const customerPaymentPayload = z.object({
  invoice_id: uuidSchema,
  on_time: z.boolean().optional(),
});
export type CustomerPaymentPayload = z.infer<typeof customerPaymentPayload>;

// A human decided a pending approval; resume the waiting agent step.
// Enqueued by the approvals_enqueue_decided trigger (0004).
export const approvalDecidedPayload = z.object({
  approval_id: uuidSchema,
  run_id: uuidSchema.nullable().optional(),
  decision: z.enum(["approved", "rejected"]).optional(),
});
export type ApprovalDecidedPayload = z.infer<typeof approvalDecidedPayload>;

// Simulated customer settled (or missed) a receivable; Finance tells Sales (S4, F5).
export const customerPaidPayload = z.object({
  runId: uuidSchema.nullable().optional(),
  invoiceId: uuidSchema,
  status: z.enum(["paid", "overdue"]),
});
export type CustomerPaidPayload = z.infer<typeof customerPaidPayload>;

export const JOB_PAYLOAD_SCHEMAS = {
  "run.start": runStartPayload,
  "handoff.process": handoffProcessPayload,
  "vendor.rfq": vendorRfqPayload,
  "vendor.dispute": vendorDisputePayload,
  "vendor.invoice": vendorInvoicePayload,
  "customer.payment": customerPaymentPayload,
  "approval.decided": approvalDecidedPayload,
  "customer.paid": customerPaidPayload,
} as const satisfies Record<JobKind, z.ZodTypeAny>;

export type JobPayload<T extends JobKind> = z.infer<(typeof JOB_PAYLOAD_SCHEMAS)[T]>;

export function parseJobPayload<T extends JobKind>(kind: T, payload: unknown): JobPayload<T> {
  return JOB_PAYLOAD_SCHEMAS[kind].parse(payload) as JobPayload<T>;
}

// What a caller builds before inserting into `jobs`.
export const jobInsertSchema = z.object({
  kind: jobKindSchema,
  payload: z.record(z.string(), z.unknown()),
  run_after: z.iso.datetime({ offset: true }).optional(),
  max_attempts: z.number().int().positive().optional(),
});
export type JobInsert = z.infer<typeof jobInsertSchema>;
