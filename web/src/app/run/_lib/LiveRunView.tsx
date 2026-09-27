"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RunView } from "@/components/run/RunView";
import type { Role } from "@/app/_lib/session";
import { buildTimeline, type AgentStepRow, type ApprovalRow, type HandoffRow } from "./map";
import { parseRunOptions, type RunOptions } from "./expose";

function upsertById<T extends { id: string }>(rows: T[], row: T): T[] {
  const i = rows.findIndex((r) => r.id === row.id);
  if (i === -1) return [...rows, row];
  const next = rows.slice();
  next[i] = row;
  return next;
}

// Realtime evaluates postgres_changes against the connecting user's RLS, so
// it needs the current session's JWT explicitly — the browser client doesn't
// always have wired it up yet by the time we open a channel.
async function authenticatedRealtime(supabase: ReturnType<typeof createClient>) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) supabase.realtime.setAuth(session.access_token);
}

export function LiveRunView({
  role,
  initialRunId,
  initialOptions,
  initialSteps,
  initialHandoffs,
  initialApprovals,
}: {
  role: Role;
  initialRunId: string | null;
  initialOptions: RunOptions;
  initialSteps: AgentStepRow[];
  initialHandoffs: HandoffRow[];
  initialApprovals: ApprovalRow[];
}) {
  const [runId, setRunId] = useState(initialRunId);
  const [options, setOptions] = useState(initialOptions);
  const [steps, setSteps] = useState(initialSteps);
  const [handoffs, setHandoffs] = useState(initialHandoffs);
  const [approvals, setApprovals] = useState(initialApprovals);

  // Always watch for the next run to start — even while an earlier run is
  // still on screen, so "reset, then start" swaps over live instead of
  // needing a reload. Mounts once; never re-subscribes.
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    authenticatedRealtime(supabase).then(() => {
      if (cancelled) return;
      channel = supabase
        .channel("agent_runs-watch")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "agent_runs" },
          (payload) => {
            const row = payload.new as { id: string; options: unknown };
            setRunId(row.id);
            setOptions(parseRunOptions(row.options));
            setSteps([]);
            setHandoffs([]);
            setApprovals([]);
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  // A run is active: stream its steps, handoffs, approval decisions, and the
  // options the run started (N4's expose link lands here once the host
  // watcher writes it).
  useEffect(() => {
    if (!runId) return;
    const supabase = createClient();
    const filter = `run_id=eq.${runId}`;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | undefined;

    authenticatedRealtime(supabase).then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`run-${runId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "agent_steps", filter },
          (payload) => {
            const row = payload.new as AgentStepRow;
            setSteps((prev) => upsertById(prev, row));
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "handoffs", filter },
          (payload) => {
            if (payload.eventType === "DELETE") return;
            const row = payload.new as HandoffRow;
            setHandoffs((prev) => upsertById(prev, row));
          },
        )
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "approvals", filter },
          (payload) => {
            if (payload.eventType === "DELETE") return;
            const row = payload.new as ApprovalRow;
            setApprovals((prev) => upsertById(prev, row));
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "agent_runs", filter: `id=eq.${runId}` },
          (payload) => {
            const row = payload.new as { options: unknown };
            setOptions(parseRunOptions(row.options));
          },
        )
        .subscribe();
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [runId]);

  const timeline = useMemo(
    () => buildTimeline(steps, handoffs, approvals),
    [steps, handoffs, approvals],
  );

  return <RunView timeline={timeline} role={role} exposeOptions={options} />;
}
