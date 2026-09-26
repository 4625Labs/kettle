import type { Handoff } from "@/app/run/_mock/types";
import { LANE_COLUMN, LANE_LABEL } from "./lanes";

const STATUS_LABEL: Record<Handoff["status"], string> = {
  pending: "waiting",
  processing: "processing",
  done: "done",
  failed: "failed",
  rejected: "rejected",
};

export function HandoffArrow({ handoff }: { handoff: Handoff }) {
  const fromCol = LANE_COLUMN[handoff.fromAgent];
  const toCol = LANE_COLUMN[handoff.toAgent];
  const forward = toCol >= fromCol;
  const isPending = handoff.status === "pending" || handoff.status === "processing";
  const isFailed = handoff.status === "failed" || handoff.status === "rejected";

  return (
    <div className="animate-[fade-in_250ms_ease-out] flex items-center gap-2 px-2 py-1">
      <div
        className={`h-px flex-1 ${
          isPending ? "border-t border-dashed border-foreground/30" : "bg-foreground/20"
        } ${isFailed ? "border-anomaly/60" : ""}`}
      />
      <span
        className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-center text-[11px] font-medium ${
          isFailed
            ? "border-anomaly/50 text-anomaly"
            : isPending
              ? "border-border text-foreground/50"
              : "border-border text-foreground/60"
        }`}
      >
        <span className="sm:hidden">{LANE_LABEL[handoff.fromAgent]} </span>
        {forward ? "→" : "←"} {LANE_LABEL[handoff.toAgent]}: {handoff.type}
        {isPending ? ` (${STATUS_LABEL[handoff.status]})` : ""}
      </span>
      <div
        className={`h-px flex-1 ${
          isPending ? "border-t border-dashed border-foreground/30" : "bg-foreground/20"
        }`}
      />
    </div>
  );
}
