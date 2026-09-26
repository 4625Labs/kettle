function ControlButton({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      disabled
      title="Wired up in phase 2 — enqueues a job, never runs agents in the request"
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground/40 disabled:cursor-not-allowed"
    >
      {children}
    </button>
  );
}

export function ControlBar() {
  return (
    <div className="flex items-center gap-2 border-b border-border bg-surface px-6 py-3">
      <ControlButton>Start scenario</ControlButton>
      <ControlButton>Inject anomaly</ControlButton>
      <ControlButton>Reset demo</ControlButton>
      <span className="ml-2 text-xs text-foreground/40">
        Demo controls — enable once jobs are wired up (phase 2)
      </span>
    </div>
  );
}
