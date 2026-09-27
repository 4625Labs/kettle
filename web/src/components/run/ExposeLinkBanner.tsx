"use client";

import type { Role } from "@/app/_lib/session";
import type { RunOptions } from "@/app/run/_lib/expose";

function CopyButton({ value }: { value: string }) {
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard?.writeText(value).catch(() => {});
      }}
      className="rounded-md border border-border px-2 py-0.5 text-xs font-medium text-foreground/60 hover:bg-background"
    >
      Copy
    </button>
  );
}

// N4: a host watcher on the app VM writes a lifecycle-bound netbird-expose
// link into agent_runs.options while a run is active. Ops-manager-only —
// it's effectively a bearer credential for this run's ephemeral URL.
//
// expose_url is the exposed app's host (the watcher exposes all of :3000),
// not the run itself — append the public read-only /r/[runId] route so the
// link actually opens the run, not the landing page.
export function ExposeLinkBanner({
  role,
  options,
  runId,
}: {
  role: Role;
  options: RunOptions;
  runId: string;
}) {
  if (role !== "ops_manager") return null;
  if (!options.expose_url || options.expose_ended_at) return null;

  const runUrl = `${options.expose_url.replace(/\/+$/, "")}/r/${runId}`;

  return (
    <div className="flex flex-col gap-1 border-b border-border bg-agent-orchestrator/10 px-6 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="font-medium text-foreground/70">Live link (expires when the run ends):</span>
        <span className="flex items-center gap-1.5">
          <a href={runUrl} target="_blank" rel="noreferrer" className="underline">
            {runUrl}
          </a>
          <CopyButton value={runUrl} />
        </span>
        {options.expose_pin && (
          <span className="flex items-center gap-1.5">
            <span className="text-foreground/50">PIN</span>
            <span className="font-mono">{options.expose_pin}</span>
            <CopyButton value={options.expose_pin} />
          </span>
        )}
      </div>
      <p className="text-xs text-foreground/50">
        Share with an auditor or stakeholder: a read-only view of this run&apos;s full trail.
        Expires when the run ends.
      </p>
    </div>
  );
}
