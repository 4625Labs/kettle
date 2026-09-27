"use client";

import { useState } from "react";
import type { AgentStep, TimelineItem } from "@/app/run/_mock/types";
import type { Role } from "@/app/_lib/session";
import type { RunOptions } from "@/app/run/_lib/expose";
import { laneSpan, LANE_COLUMN_CLASS } from "./lanes";
import { StepCard } from "./StepCard";
import { HandoffArrow } from "./HandoffArrow";
import { StepInspectorDrawer } from "./StepInspectorDrawer";
import { ControlBar } from "./ControlBar";
import { ExposeLinkBanner } from "./ExposeLinkBanner";
import { RunViewEmpty, GRID_COLS_CLASS, LaneHeaders } from "./RunViewStates";

// Every possible lane-to-lane span in a 4-column grid, spelled out as literal
// Tailwind arbitrary-property classes so the JIT scanner can find them
// (a template-interpolated class string is invisible to it at build time).
const SPAN_CLASS: Record<string, string> = {
  "1-2": "col-span-full sm:[grid-column:1/3]",
  "1-3": "col-span-full sm:[grid-column:1/4]",
  "1-4": "col-span-full sm:[grid-column:1/5]",
  "2-3": "col-span-full sm:[grid-column:2/4]",
  "2-4": "col-span-full sm:[grid-column:2/5]",
  "3-4": "col-span-full sm:[grid-column:3/5]",
};

function OrchestratorMarker({ step }: { step: AgentStep }) {
  return (
    <div className="flex items-center gap-2 py-1 sm:justify-center" title={step.summary}>
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ background: "var(--agent-orchestrator)" }}
      />
      <span className="text-xs text-foreground/40 sm:hidden">{step.summary}</span>
    </div>
  );
}

export function RunView({
  timeline,
  role,
  exposeOptions,
  hideControls = false,
}: {
  timeline: TimelineItem[];
  role?: Role;
  exposeOptions?: RunOptions;
  hideControls?: boolean;
}) {
  const [selected, setSelected] = useState<AgentStep | null>(null);

  if (timeline.length === 0) {
    return (
      <div className="flex flex-1 flex-col">
        {!hideControls && <ControlBar />}
        {role && exposeOptions && <ExposeLinkBanner role={role} options={exposeOptions} />}
        <RunViewEmpty />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      {!hideControls && <ControlBar />}
      {role && exposeOptions && <ExposeLinkBanner role={role} options={exposeOptions} />}
      <LaneHeaders sticky />

      <div className={`grid flex-1 gap-x-3 gap-y-2 overflow-y-auto px-4 py-3 ${GRID_COLS_CLASS}`}>
        {timeline.map((item, index) => {
          const row = index + 1;

          if (item.kind === "step") {
            return (
              <div key={item.id} style={{ gridRow: row }} className={LANE_COLUMN_CLASS[item.agent]}>
                {item.agent === "orchestrator" ? (
                  <OrchestratorMarker step={item} />
                ) : (
                  <StepCard step={item} onSelect={setSelected} />
                )}
              </div>
            );
          }

          const { start, end } = laneSpan(item.fromAgent, item.toAgent);
          return (
            <div
              key={item.id}
              style={{ gridRow: row }}
              className={SPAN_CLASS[`${start}-${end}`]}
            >
              <HandoffArrow handoff={item} />
            </div>
          );
        })}
      </div>

      <StepInspectorDrawer step={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
