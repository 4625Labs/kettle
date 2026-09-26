import type { Agent } from "@/lib/contracts";
import { must, serviceDb } from "./db";

// Every agent action gets written here — this audit trail is the product's core UI (a live
// execution timeline), not a side dashboard (K3).

export interface LlmStats {
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
}

export async function startRun(params: {
  goal: string;
  agent?: Agent;
  options?: Record<string, unknown>;
}) {
  return must(
    await serviceDb()
      .from("agent_runs")
      .insert({
        goal: params.goal,
        agent: params.agent ?? "orchestrator",
        options: (params.options ?? {}) as never,
      })
      .select()
      .single(),
    "startRun",
  );
}

export async function recordStep(params: {
  runId: string;
  agent: Agent;
  action: string;
  input?: unknown;
  output?: unknown;
  status?: "ok" | "error" | "flagged";
  rationale?: string;
  llm?: LlmStats | null;
}) {
  const db = serviceDb();
  // Step numbers are display order within a run. Concurrent jobs can race on max+1; the UI also
  // orders by created_at, so a rare duplicate number is cosmetic.
  const { data: last } = await db
    .from("agent_steps")
    .select("step_number")
    .eq("run_id", params.runId)
    .order("step_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  return must(
    await db
      .from("agent_steps")
      .insert({
        run_id: params.runId,
        step_number: (last?.step_number ?? 0) + 1,
        agent: params.agent,
        action: params.action,
        input: (params.input ?? null) as never,
        output: (params.output ?? null) as never,
        status: params.status ?? "ok",
        rationale: params.rationale ?? null,
        model: params.llm?.model ?? null,
        latency_ms: params.llm?.latencyMs ?? null,
        tokens_in: params.llm?.tokensIn ?? null,
        tokens_out: params.llm?.tokensOut ?? null,
      })
      .select()
      .single(),
    "recordStep",
  );
}

/** Marks a running run finished. Returns false if it was already finished (so callers log once). */
export async function completeRun(runId: string, status: "completed" | "failed"): Promise<boolean> {
  const { data, error } = await serviceDb()
    .from("agent_runs")
    .update({ status, completed_at: new Date().toISOString() })
    .eq("id", runId)
    .eq("status", "running")
    .select("id");
  if (error) throw error;
  return (data ?? []).length > 0;
}
