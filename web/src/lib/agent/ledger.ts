import { createServiceRoleClient } from "@/lib/supabase/server";

// Every agent action gets written here first — this audit trail is the product's
// core UI (a live execution timeline), not a side dashboard.

export async function startRun(goal: string) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("agent_runs")
    .insert({ goal })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function recordStep(params: {
  runId: string;
  stepNumber: number;
  action: string;
  input?: unknown;
  output?: unknown;
  status?: "ok" | "error" | "flagged";
}) {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("agent_steps")
    .insert({
      run_id: params.runId,
      step_number: params.stepNumber,
      action: params.action,
      input: params.input ?? null,
      output: params.output ?? null,
      status: params.status ?? "ok",
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function completeRun(runId: string, status: "completed" | "failed") {
  const supabase = createServiceRoleClient();
  const { error } = await supabase
    .from("agent_runs")
    .update({ status, completed_at: new Date().toISOString() })
    .eq("id", runId);

  if (error) throw error;
}
