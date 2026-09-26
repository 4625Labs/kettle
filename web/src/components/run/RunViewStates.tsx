import { LANE_LABEL, LANE_COLUMN_CLASS } from "./lanes";

const LANES = (["orchestrator", "sales", "procurement", "finance"] as const).map(
  (agent) => ({ agent, label: LANE_LABEL[agent] }),
);

// Single column on phones; the 4-lane grid only kicks in at `sm` and up.
export const GRID_COLS_CLASS = "grid-cols-1 sm:grid-cols-[72px_repeat(3,minmax(0,1fr))]";

export function LaneHeaders({ sticky = false }: { sticky?: boolean } = {}) {
  return (
    <div
      className={`hidden gap-x-3 border-b border-border bg-background px-4 py-2 sm:grid ${GRID_COLS_CLASS} ${
        sticky ? "sticky top-0 z-10" : ""
      }`}
    >
      {LANES.map(({ agent, label }) => (
        <div key={agent} className={`flex items-center gap-2 ${LANE_COLUMN_CLASS[agent]}`}>
          {agent !== "orchestrator" && (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: `var(--agent-${agent})` }}
            />
          )}
          <span
            className={`text-xs font-semibold uppercase tracking-wide ${
              agent === "orchestrator" ? "text-foreground/40" : "text-foreground/70"
            }`}
          >
            {label}
          </span>
        </div>
      ))}
    </div>
  );
}

export function RunViewEmpty() {
  return (
    <div className="flex flex-1 flex-col">
      <LaneHeaders />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <p className="text-sm font-medium text-foreground/70">No run in progress</p>
        <p className="max-w-sm text-sm text-foreground/50">
          Start the golden-path scenario from the control bar above to watch
          Sales, Procurement, and Finance hand work to each other live.
        </p>
      </div>
    </div>
  );
}

export function RunViewLoading() {
  return (
    <div className="flex flex-1 flex-col" aria-busy="true" aria-live="polite">
      <LaneHeaders />
      <div className={`grid flex-1 gap-x-3 gap-y-2 px-4 py-3 ${GRID_COLS_CLASS}`}>
        {(["sales", "procurement", "finance"] as const).map((agent) => (
          <div key={agent} className={`flex flex-col gap-2 ${LANE_COLUMN_CLASS[agent]}`}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-16 animate-pulse rounded-lg border border-border bg-surface motion-reduce:animate-none"
                style={{ opacity: 1 - i * 0.2 }}
              />
            ))}
          </div>
        ))}
      </div>
      <p className="px-4 pb-3 text-center text-xs text-foreground/40">
        Loading run…
      </p>
    </div>
  );
}

export function RunViewError({ message }: { message: string }) {
  return (
    <div className="flex flex-1 flex-col">
      <LaneHeaders />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
        <span className="rounded-full border border-anomaly/40 bg-anomaly/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-anomaly">
          Error
        </span>
        <p className="max-w-sm text-sm text-foreground/70">{message}</p>
      </div>
    </div>
  );
}
