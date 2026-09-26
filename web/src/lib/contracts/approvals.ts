import { z } from "zod";
import {
  agentSchema,
  approvalSubjectTypeSchema,
  profileRoleSchema,
  uuidSchema,
  type ApprovalSubjectType,
} from "./enums";

// What an agent builds before inserting into `approvals` (K4). Inserts are service-role only;
// this validates shape before the worker writes the row.
export const approvalInsertSchema = z.object({
  run_id: uuidSchema.nullable().optional(),
  subject_type: approvalSubjectTypeSchema,
  subject_id: uuidSchema,
  requested_by_agent: agentSchema,
  required_role: profileRoleSchema,
  reason: z.string().optional(),
  amount: z.number().nonnegative().optional(),
});
export type ApprovalInsert = z.infer<typeof approvalInsertSchema>;

// What the UI sends when a human decides a pending approval. `decided_by` must be the caller's
// own auth.uid() — RLS rejects the update otherwise (and the UPDATE grant is scoped to exactly
// these columns, so no other field can be changed in the same statement).
export const approvalDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  decided_by: uuidSchema,
  decided_at: z.iso.datetime({ offset: true }).optional(),
  note: z.string().optional(),
});
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>;

// subject_type -> the table subject_id points into, for UI joins and the worker's resume step.
export const APPROVAL_SUBJECT_TABLES: Record<ApprovalSubjectType, string> = {
  purchase_order: "purchase_orders",
  payment: "payments",
  invoice_correction: "invoices",
};
