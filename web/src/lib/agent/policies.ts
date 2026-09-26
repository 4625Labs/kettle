import { serviceDb } from "./db";

// Runtime thresholds live in the `policies` table (K7); these defaults only apply if a row is missing.
export interface Policies {
  poApprovalThreshold: number;
  matchTolerancePct: number;
  maxSteps: number;
  targetMarginPct: number;
}

const DEFAULTS: Policies = {
  poApprovalThreshold: 10_000,
  matchTolerancePct: 5,
  maxSteps: 20,
  targetMarginPct: 15,
};

export async function loadPolicies(): Promise<Policies> {
  const { data } = await serviceDb().from("policies").select("key, value");
  const byKey = new Map((data ?? []).map((r) => [r.key, r.value as Record<string, unknown>]));
  const num = (key: string, field: string, fallback: number) => {
    const v = Number(byKey.get(key)?.[field]);
    return Number.isFinite(v) ? v : fallback;
  };
  return {
    poApprovalThreshold: num("po_approval_threshold", "amount", DEFAULTS.poApprovalThreshold),
    matchTolerancePct: num("match_tolerance_pct", "percent", DEFAULTS.matchTolerancePct),
    maxSteps: num("max_steps", "count", DEFAULTS.maxSteps),
    targetMarginPct: num("target_margin_pct", "percent", DEFAULTS.targetMarginPct),
  };
}
