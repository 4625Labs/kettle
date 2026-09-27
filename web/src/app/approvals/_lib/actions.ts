"use server";

import { requireSession } from "@/app/_lib/session";
import { createClient } from "@/lib/supabase/server";
import { approvalDecisionSchema } from "@/lib/contracts";

export type DecisionState = { error: string } | { ok: true } | undefined;

export async function decideApproval(
  _prev: DecisionState,
  formData: FormData,
): Promise<DecisionState> {
  const session = await requireSession();

  const approvalId = String(formData.get("approval_id") ?? "");
  const decision = formData.get("decision");
  const note = String(formData.get("note") ?? "").trim();

  if (decision !== "approved" && decision !== "rejected") {
    return { error: "Invalid decision." };
  }

  let payload;
  try {
    payload = approvalDecisionSchema.parse({
      status: decision,
      decided_by: session.user.id,
      decided_at: new Date().toISOString(),
      note: note || undefined,
    });
  } catch {
    return { error: "Could not build the decision." };
  }

  // RLS enforces who may decide what (required_role match, or ops_manager for
  // anything) and binds decided_by to the caller — this is the signed-in
  // user's own client, not service role.
  const supabase = await createClient();
  const { error, data } = await supabase
    .from("approvals")
    .update(payload)
    .eq("id", approvalId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error || !data) {
    return { error: "Could not record the decision. It may already be decided." };
  }

  return { ok: true };
}
