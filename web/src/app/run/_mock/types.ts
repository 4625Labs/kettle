// Mock-only shape for the run view until the Data agent's `agent_steps` /
// `handoffs` migration (0002) lands and Realtime subscriptions replace this
// fixture. Field names mirror the planned schema (docs/agents/data.md) so the
// swap is a drop-in.

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
