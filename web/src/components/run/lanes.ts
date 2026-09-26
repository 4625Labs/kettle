import type { Agent } from "@/app/run/_mock/types";

// Grid column per lane: a thin Orchestrator rail, then the three agent lanes.
export const LANE_COLUMN: Record<Agent, number> = {
  orchestrator: 1,
  sales: 2,
  procurement: 3,
  finance: 4,
};

export const LANE_LABEL: Record<Agent, string> = {
  orchestrator: "Orchestrator",
  sales: "Sales",
  procurement: "Procurement",
  finance: "Finance",
};

export function laneSpan(a: Agent, b: Agent) {
  const colA = LANE_COLUMN[a];
  const colB = LANE_COLUMN[b];
  return { start: Math.min(colA, colB), end: Math.max(colA, colB) };
}

// Stack single-column on phones; only pick up the lane column at `sm` and up.
// Spelled out literally (not built from LANE_COLUMN) so Tailwind's JIT scanner
// can see each class name in source.
export const LANE_COLUMN_CLASS: Record<Agent, string> = {
  orchestrator: "col-span-full sm:[grid-column:1]",
  sales: "col-span-full sm:[grid-column:2]",
  procurement: "col-span-full sm:[grid-column:3]",
  finance: "col-span-full sm:[grid-column:4]",
};
