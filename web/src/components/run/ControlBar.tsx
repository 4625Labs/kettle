"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { startScenario, resetDemo, type ControlState } from "@/app/run/_lib/actions";

function errorOf(state: ControlState): string | undefined {
  return state && "error" in state ? state.error : undefined;
}

export function ControlBar() {
  const router = useRouter();
  const [injectAnomaly, setInjectAnomaly] = useState(false);
  const [startState, startAction, startPending] = useActionState<ControlState, FormData>(
    startScenario,
    undefined,
  );
  const [resetState, resetActionFn, resetPending] = useActionState<ControlState, FormData>(
    resetDemo,
    undefined,
  );

  // Realtime picks up a newly-started run on its own; reset has nothing to
  // stream (there's no per-row DELETE event for a truncate), so re-fetch the
  // server data to clear the (now stale) run off the screen.
  useEffect(() => {
    if (resetState && "ok" in resetState) router.refresh();
  }, [resetState, router]);

  const error = errorOf(startState) ?? errorOf(resetState);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-surface px-6 py-3">
      <form action={startAction} className="flex items-center gap-2">
        <input type="hidden" name="inject_anomaly" value={injectAnomaly ? "true" : "false"} />
        <button
          type="submit"
          disabled={startPending}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface disabled:cursor-wait disabled:opacity-60"
        >
          {startPending ? "Starting…" : "Start scenario"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => setInjectAnomaly((v) => !v)}
        aria-pressed={injectAnomaly}
        className={`rounded-md border px-3 py-1.5 text-sm font-medium transition-colors ${
          injectAnomaly
            ? "border-anomaly/50 bg-anomaly/10 text-anomaly"
            : "border-border bg-background text-foreground/70 hover:bg-surface"
        }`}
      >
        Inject anomaly{injectAnomaly ? " ✓" : ""}
      </button>

      <form action={resetActionFn}>
        <button
          type="submit"
          disabled={resetPending}
          className="rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium transition-colors hover:bg-surface disabled:cursor-wait disabled:opacity-60"
        >
          {resetPending ? "Resetting…" : "Reset demo"}
        </button>
      </form>

      <span className="text-xs text-foreground/40">
        Toggle before Start scenario to force the vendor to overbill (W3).
      </span>

      {error && (
        <span role="alert" className="text-xs font-medium text-anomaly">
          {error}
        </span>
      )}
    </div>
  );
}
