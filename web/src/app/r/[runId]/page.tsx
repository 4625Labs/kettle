import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/contracts";
import { RunView } from "@/components/run/RunView";
import { buildTimeline } from "@/app/run/_lib/map";

// Public, read-only: reachable only via a NetBird `expose` link (the PIN on
// that URL is the gate, not Supabase auth — proxy.ts exempts /r/*). No
// control bar, no approvals, no session. Service-role read; runId validated
// before it ever reaches a query. Deliberately never selects agent_runs.options
// (that's where the expose_pin itself lives).
export default async function PublicRunPage({ params }: PageProps<"/r/[runId]">) {
  const { runId } = await params;
  if (!uuidSchema.safeParse(runId).success) notFound();

  const supabase = createServiceRoleClient();
  const { data: run } = await supabase
    .from("agent_runs")
    .select("id, goal, status")
    .eq("id", runId)
    .maybeSingle();

  if (!run) notFound();

  const [{ data: steps }, { data: handoffs }] = await Promise.all([
    supabase.from("agent_steps").select("*").eq("run_id", run.id).order("created_at"),
    supabase.from("handoffs").select("*").eq("run_id", run.id).order("created_at"),
  ]);

  const timeline = buildTimeline(steps ?? [], handoffs ?? [], []);

  return (
    <div className="flex flex-1 flex-col">
      <div className="border-b border-border bg-surface px-6 py-3">
        <p className="text-sm font-medium">{run.goal}</p>
        <p className="text-xs text-foreground/50">Read-only view · run status: {run.status}</p>
      </div>
      <RunView timeline={timeline} hideControls />
    </div>
  );
}
