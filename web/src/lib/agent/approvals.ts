import { approvalInsertSchema, type Agent, type ApprovalSubjectType, type ProfileRole } from "@/lib/contracts";
import { must, serviceDb } from "./db";
import { recordStep } from "./ledger";

/**
 * Human approval gate (K4). Creates a pending approval and records a flagged step; the agent's
 * work stops here. The 0004 trigger enqueues `approval.decided` when a human decides, and the
 * worker resumes via resumeApproval() in dispatch.
 */
export async function requestApproval(params: {
  runId: string;
  agent: Agent;
  subjectType: ApprovalSubjectType;
  subjectId: string;
  requiredRole: ProfileRole;
  reason: string;
  amount?: number;
}) {
  const db = serviceDb();
  // Idempotent: a retried step must not open a second approval for the same subject.
  const { data: existing } = await db
    .from("approvals")
    .select("id")
    .eq("subject_type", params.subjectType)
    .eq("subject_id", params.subjectId)
    .eq("status", "pending")
    .maybeSingle();
  if (existing) return existing.id;

  const row = approvalInsertSchema.parse({
    run_id: params.runId,
    subject_type: params.subjectType,
    subject_id: params.subjectId,
    requested_by_agent: params.agent,
    required_role: params.requiredRole,
    reason: params.reason,
    amount: params.amount,
  });
  const approval = must(await db.from("approvals").insert(row).select("id").single(), "requestApproval");

  await recordStep({
    runId: params.runId,
    agent: params.agent,
    action: "approval.requested",
    input: { subject_type: params.subjectType, subject_id: params.subjectId, amount: params.amount },
    output: { approval_id: approval.id, required_role: params.requiredRole, waiting: true },
    status: "flagged",
    rationale: params.reason,
  });
  return approval.id;
}
