import type { Tables } from "@/lib/supabase/types";
import type { Agent, AgentStep, Handoff, StepStatus, TimelineItem } from "../_mock/types";

export type AgentStepRow = Tables<"agent_steps">;
export type HandoffRow = Tables<"handoffs">;
export type ApprovalRow = Tables<"approvals">;

function asAgent(value: string | null): Agent {
  return value === "sales" || value === "procurement" || value === "finance"
    ? value
    : "orchestrator";
}

function asStepStatus(value: string): StepStatus {
  return value === "error" || value === "flagged" ? value : "ok";
}

// Steps carry an LLM rationale for most actions; deterministic steps (or ones
// still missing one) fall back to the first output field, then the action name.
function summaryFor(row: AgentStepRow): string {
  if (row.rationale) return row.rationale;
  if (row.output && typeof row.output === "object" && !Array.isArray(row.output)) {
    const [key, value] = Object.entries(row.output as Record<string, unknown>)[0] ?? [];
    if (key) return `${key}: ${JSON.stringify(value)}`;
  }
  return row.action;
}

export function stepToItem(row: AgentStepRow): AgentStep {
  return {
    kind: "step",
    id: row.id,
    sequence: 0,
    agent: asAgent(row.agent),
    action: row.action,
    summary: summaryFor(row),
    status: asStepStatus(row.status),
    input: row.input,
    output: row.output,
    rationale: row.rationale ?? "",
    model: row.model ?? "—",
    latencyMs: row.latency_ms ?? 0,
    tokensIn: row.tokens_in ?? 0,
    tokensOut: row.tokens_out ?? 0,
    createdAt: row.created_at,
  };
}

export function handoffToItem(row: HandoffRow): Handoff {
  return {
    kind: "handoff",
    id: row.id,
    sequence: 0,
    fromAgent: asAgent(row.from_agent),
    toAgent: asAgent(row.to_agent),
    type: row.type,
    status: row.status as Handoff["status"],
    createdAt: row.created_at,
  };
}

// Approvals aren't steps, but they're the clearest "a human is in the loop
// here" moment in the run, so they render as pulsing cards in the requesting
// agent's lane rather than a separate panel.
export function approvalToItem(row: ApprovalRow): AgentStep {
  const pending = row.status === "pending";
  return {
    kind: "step",
    id: `approval-${row.id}`,
    sequence: 0,
    agent: asAgent(row.requested_by_agent),
    action: `approval.${row.subject_type}`,
    summary:
      row.reason ??
      `${row.subject_type.replace("_", " ")} approval${
        row.amount ? ` — $${Number(row.amount).toLocaleString()}` : ""
      } (${row.required_role.replace("_", " ")})`,
    status: row.status === "rejected" ? "flagged" : "ok",
    awaitingApproval: pending,
    resolved: row.status === "approved",
    input: {
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      amount: row.amount,
      required_role: row.required_role,
    },
    output: pending ? null : { status: row.status, decided_by: row.decided_by, note: row.note },
    rationale: row.reason ?? "",
    model: "human",
    latencyMs: 0,
    tokensIn: 0,
    tokensOut: 0,
    createdAt: row.created_at,
    linkedRecords: [{ label: row.subject_type.replace("_", " "), id: row.subject_id }],
  };
}

export function buildTimeline(
  steps: AgentStepRow[],
  handoffs: HandoffRow[],
  approvals: ApprovalRow[],
): TimelineItem[] {
  const items = [
    ...steps.map(stepToItem),
    ...handoffs.map(handoffToItem),
    ...approvals.map(approvalToItem),
  ];
  items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return items.map((item, sequence) => ({ ...item, sequence }));
}
