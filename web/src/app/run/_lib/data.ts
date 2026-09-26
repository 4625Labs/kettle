import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { AgentStepRow, ApprovalRow, HandoffRow } from "./map";

export interface LatestRun {
  runId: string;
  steps: AgentStepRow[];
  handoffs: HandoffRow[];
  approvals: ApprovalRow[];
}

// The most recently started run, regardless of status — the demo runs one
// scenario at a time, so "latest" is "the one to show".
export async function getLatestRun(): Promise<LatestRun | null> {
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("agent_runs")
    .select("id")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!run) return null;

  const [{ data: steps }, { data: handoffs }, { data: approvals }] = await Promise.all([
    supabase.from("agent_steps").select("*").eq("run_id", run.id).order("created_at"),
    supabase.from("handoffs").select("*").eq("run_id", run.id).order("created_at"),
    supabase.from("approvals").select("*").eq("run_id", run.id).order("created_at"),
  ]);

  return {
    runId: run.id,
    steps: steps ?? [],
    handoffs: handoffs ?? [],
    approvals: approvals ?? [],
  };
}
