import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";
import type { Role } from "@/app/_lib/session";

export type ApprovalRow = Tables<"approvals">;

// ops_manager can decide anything pending (matches the approvals_decide RLS
// policy); everyone else only sees approvals waiting on their own role.
export async function getPendingApprovals(role: Role): Promise<ApprovalRow[]> {
  const supabase = await createClient();
  let query = supabase
    .from("approvals")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (role !== "ops_manager") {
    query = query.eq("required_role", role);
  }

  const { data } = await query;
  return data ?? [];
}
