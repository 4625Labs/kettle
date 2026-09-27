"use client";

import { useActionState } from "react";
import { decideApproval, type DecisionState } from "./actions";
import type { ApprovalRow } from "./data";

const AGENT_VAR: Record<string, string> = {
  sales: "var(--agent-sales)",
  procurement: "var(--agent-procurement)",
  finance: "var(--agent-finance)",
  orchestrator: "var(--agent-orchestrator)",
};

export function ApprovalItem({ approval }: { approval: ApprovalRow }) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(
    decideApproval,
    undefined,
  );
  const decided = state && "ok" in state;

  if (decided) {
    return (
      <li className="rounded-lg border border-resolved/40 bg-resolved/5 p-4 text-sm text-foreground/60">
        Decision recorded.
      </li>
    );
  }

  return (
    <li
      className="rounded-lg border border-border bg-surface p-4"
      style={{ borderLeftWidth: 4, borderLeftColor: AGENT_VAR[approval.requested_by_agent] }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
          {approval.subject_type.replace("_", " ")} · requested by {approval.requested_by_agent}
        </span>
        {approval.amount !== null && (
          <span className="text-sm font-semibold">
            ${Number(approval.amount).toLocaleString()}
          </span>
        )}
      </div>

      {approval.reason && <p className="mt-2 text-sm leading-relaxed">{approval.reason}</p>}

      <p className="mt-1 font-mono text-xs text-foreground/40">{approval.subject_id}</p>

      <form action={action} className="mt-3 flex flex-col gap-2">
        <input type="hidden" name="approval_id" value={approval.id} />
        <textarea
          name="note"
          placeholder="Note (optional)"
          rows={1}
          className="rounded-md border border-border bg-background px-2 py-1 text-sm outline-none focus:border-agent-sales"
        />
        <div className="flex items-center gap-2">
          <button
            type="submit"
            name="decision"
            value="approved"
            disabled={pending}
            className="rounded-md bg-resolved px-3 py-1.5 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="submit"
            name="decision"
            value="rejected"
            disabled={pending}
            className="rounded-md border border-anomaly/50 px-3 py-1.5 text-sm font-medium text-anomaly transition-colors hover:bg-anomaly/10 disabled:cursor-wait disabled:opacity-60"
          >
            Reject
          </button>
          {state && "error" in state && (
            <span role="alert" className="text-xs font-medium text-anomaly">
              {state.error}
            </span>
          )}
        </div>
      </form>
    </li>
  );
}
