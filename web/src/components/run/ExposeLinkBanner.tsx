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
export function ExposeLinkBanner({ role, options }: { role: Role; options: RunOptions }) {
  if (role !== "ops_manager") return null;
  if (!options.expose_url || options.expose_ended_at) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-agent-orchestrator/10 px-6 py-2 text-sm">
      <span className="font-medium text-foreground/70">Live link (expires when the run ends):</span>
      <span className="flex items-center gap-1.5">
        <a href={options.expose_url} target="_blank" rel="noreferrer" className="underline">
          {options.expose_url}
        </a>
        <CopyButton value={options.expose_url} />
      </span>
      {options.expose_pin && (
        <span className="flex items-center gap-1.5">
          <span className="text-foreground/50">PIN</span>
          <span className="font-mono">{options.expose_pin}</span>
          <CopyButton value={options.expose_pin} />
        </span>
      )}
    </div>
  );
}
