"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { RunView } from "@/components/run/RunView";
import { buildTimeline, type AgentStepRow, type ApprovalRow, type HandoffRow } from "./map";

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
  initialRunId,
  initialSteps,
  initialHandoffs,
  initialApprovals,
}: {
  initialRunId: string | null;
  initialSteps: AgentStepRow[];
  initialHandoffs: HandoffRow[];
  initialApprovals: ApprovalRow[];
}) {
  const [runId, setRunId] = useState(initialRunId);
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
            const row = payload.new as { id: string };
            setRunId(row.id);
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

  // A run is active: stream its steps, handoffs, and approval decisions.
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

  return <RunView timeline={timeline} />;
}
