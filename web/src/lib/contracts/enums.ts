import { z } from "zod";

// Postgres `uuid` accepts any 8-4-4-4-12 hex string regardless of RFC version/variant bits, and
// Kettle's seed data uses human-readable fake ids (e.g. `10000000-0000-0000-0000-000000000001`)
// that fail zod's stricter `z.uuid()` (which validates version nibbles). Match Postgres instead.
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "expected a UUID");

export const AGENTS = ["sales", "procurement", "finance", "orchestrator"] as const;
export const agentSchema = z.enum(AGENTS);
export type Agent = z.infer<typeof agentSchema>;

export const PROFILE_ROLES = ["ops_manager", "sales_rep", "finance_controller"] as const;
export const profileRoleSchema = z.enum(PROFILE_ROLES);
export type ProfileRole = z.infer<typeof profileRoleSchema>;

export const HANDOFF_STATUSES = ["pending", "processing", "done", "failed", "rejected"] as const;
export const handoffStatusSchema = z.enum(HANDOFF_STATUSES);
export type HandoffStatus = z.infer<typeof handoffStatusSchema>;

export const HANDOFF_TYPES = [
  "purchase_request.create",
  "customer_invoice.create",
  "vendor_invoice.expect",
  "invoice.anomaly",
  "invoice.corrected",
  "payment.status",
  "receivable.overdue",
] as const;
export const handoffTypeSchema = z.enum(HANDOFF_TYPES);
export type HandoffType = z.infer<typeof handoffTypeSchema>;

export const APPROVAL_STATUSES = ["pending", "approved", "rejected"] as const;
export const approvalStatusSchema = z.enum(APPROVAL_STATUSES);
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>;

export const APPROVAL_SUBJECT_TYPES = ["purchase_order", "payment", "invoice_correction"] as const;
export const approvalSubjectTypeSchema = z.enum(APPROVAL_SUBJECT_TYPES);
export type ApprovalSubjectType = z.infer<typeof approvalSubjectTypeSchema>;

export const JOB_STATUSES = ["queued", "running", "done", "failed"] as const;
export const jobStatusSchema = z.enum(JOB_STATUSES);
export type JobStatus = z.infer<typeof jobStatusSchema>;

export const JOB_KINDS = [
  "run.start",
  "handoff.process",
  "vendor.rfq",
  "vendor.dispute",
  "vendor.invoice",
  "customer.payment",
  "approval.decided",
  "customer.paid",
] as const;
export const jobKindSchema = z.enum(JOB_KINDS);
export type JobKind = z.infer<typeof jobKindSchema>;
