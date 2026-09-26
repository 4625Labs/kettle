import type { AgentStep } from "@/app/run/_mock/types";
import { LANE_LABEL } from "./lanes";

const AGENT_VAR: Record<AgentStep["agent"], string> = {
  sales: "var(--agent-sales)",
  procurement: "var(--agent-procurement)",
  finance: "var(--agent-finance)",
  orchestrator: "var(--agent-orchestrator)",
};

function Badge({ tone, children }: { tone: "amber" | "green" | "neutral"; children: React.ReactNode }) {
  const toneClass =
    tone === "amber"
      ? "border-anomaly/40 bg-anomaly/10 text-anomaly"
      : tone === "green"
        ? "border-resolved/40 bg-resolved/10 text-resolved"
        : "border-border text-foreground/50";
  return (
    <span
      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${toneClass}`}
    >
      {children}
    </span>
  );
}

export function StepCard({
  step,
  onSelect,
}: {
  step: AgentStep;
  onSelect: (step: AgentStep) => void;
}) {
  const isAnomaly = step.status === "flagged";
  const isResolved = Boolean(step.resolved);
  const isAwaitingApproval = Boolean(step.awaitingApproval);

  return (
    <button
      type="button"
      onClick={() => onSelect(step)}
      className={`animate-[fade-in_250ms_ease-out] w-full rounded-lg border bg-surface p-3 text-left transition-transform hover:-translate-y-0.5 hover:shadow-md ${
        isAnomaly ? "border-anomaly/60" : isResolved ? "border-resolved/50" : "border-border"
      } ${isAwaitingApproval ? "relative" : ""}`}
      style={{ borderLeftWidth: 4, borderLeftColor: AGENT_VAR[step.agent] }}
    >
      {isAwaitingApproval && (
        <span
          aria-hidden
          className="absolute -top-1.5 -right-1.5 flex h-3.5 w-3.5"
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-anomaly/60 motion-reduce:animate-none" />
          <span className="relative inline-flex h-3.5 w-3.5 rounded-full bg-anomaly" />
        </span>
      )}

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground/50">
          <span className="sm:hidden">{LANE_LABEL[step.agent]} · </span>
          {step.action}
        </span>
        {isAnomaly && <Badge tone="amber">Anomaly</Badge>}
        {isResolved && <Badge tone="green">Resolved</Badge>}
        {isAwaitingApproval && !isAnomaly && <Badge tone="neutral">Needs approval</Badge>}
      </div>

      <p className="mt-1.5 text-sm leading-snug">{step.summary}</p>
    </button>
  );
}
