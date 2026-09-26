// Canonical run-view UI shape. `run/_lib/map.ts` builds these from real
// agent_steps/handoffs/approvals rows; `run/_mock/data.ts` builds them by hand
// for the `?state=` preview hook. Both feed the same `RunView` component.

export type Agent = "sales" | "procurement" | "finance" | "orchestrator";
export type StepStatus = "ok" | "error" | "flagged";
export type HandoffStatus = "pending" | "processing" | "done" | "failed" | "rejected";

export interface LinkedRecord {
  label: string;
  id: string;
}

export interface AgentStep {
  kind: "step";
  id: string;
  sequence: number;
  agent: Agent;
  action: string;
  summary: string;
  status: StepStatus;
  resolved?: boolean;
  awaitingApproval?: boolean;
  input: unknown;
  output: unknown;
  rationale: string;
  model: string;
  latencyMs: number;
  tokensIn: number;
  tokensOut: number;
  createdAt: string;
  linkedRecords?: LinkedRecord[];
}

export interface Handoff {
  kind: "handoff";
  id: string;
  sequence: number;
  fromAgent: Agent;
  toAgent: Agent;
  type: string;
  status: HandoffStatus;
  createdAt: string;
}

export type TimelineItem = AgentStep | Handoff;
