"use server";

import { requireSession } from "@/app/_lib/session";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { runStartPayload } from "@/lib/contracts";

export type ControlState = { error: string } | { ok: true } | undefined;

export async function startScenario(
  _prev: ControlState,
  formData: FormData,
): Promise<ControlState> {
  const session = await requireSession();
  if (session.role !== "ops_manager" && session.role !== "sales_rep") {
    return { error: "Only an ops manager or sales rep can start a scenario." };
  }

  const supabase = await createClient();
  const { data: deal, error: dealError } = await supabase
    .from("deals")
    .select("id, title")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (dealError || !deal) {
    return { error: "No deal found to run the scenario against." };
  }

  let payload;
  try {
    payload = runStartPayload.parse({
      agent: "sales",
      goal: `Fulfill: ${deal.title}`,
      deal_id: deal.id,
      inject_anomaly: formData.get("inject_anomaly") === "true",
    });
  } catch {
    return { error: "Could not build the scenario job." };
  }

  // Jobs are service-role-write-only (RLS) — validated above, inserted here.
  const service = createServiceRoleClient();
  const { error: insertError } = await service.from("jobs").insert({
    kind: "run.start",
    payload,
  });

  if (insertError) {
    return { error: "Could not start the scenario. Check the worker is running." };
  }

  return { ok: true };
}

export async function resetDemo(
  _prev: ControlState,
  _formData: FormData,
): Promise<ControlState> {
  const session = await requireSession();
  if (session.role !== "ops_manager") {
    return { error: "Only an ops manager can reset the demo." };
  }

  // reset_demo() checks current_role_name() itself — call as the signed-in user, not service role.
  const supabase = await createClient();
  const { error } = await supabase.rpc("reset_demo");

  if (error) {
    return { error: "Reset failed." };
  }

  return { ok: true };
}
