import {
  handoffInsertSchema,
  type Agent,
  type HandoffPayload,
  type HandoffType,
} from "@/lib/contracts";
import { must, serviceDb } from "./db";
import { recordStep } from "./ledger";
import { enqueue } from "./queue";

/**
 * Emits a handoff (K1): validated against the allow-list and its payload schema, inserted once per
 * idempotency key (K5), then queued for the orchestrator. Agents never call each other directly.
 */
export async function emitHandoff<T extends HandoffType>(params: {
  runId: string;
  from: Agent;
  to: Agent;
  type: T;
  payload: HandoffPayload<T>;
  idempotencyKey: string;
  dealId?: string | null;
  purchaseRequestId?: string | null;
  purchaseOrderId?: string | null;
  invoiceId?: string | null;
  rationale?: string;
}) {
  const row = handoffInsertSchema.parse({
    run_id: params.runId,
    from_agent: params.from,
    to_agent: params.to,
    type: params.type,
    payload: params.payload,
    idempotency_key: params.idempotencyKey,
    deal_id: params.dealId ?? null,
    purchase_request_id: params.purchaseRequestId ?? null,
    purchase_order_id: params.purchaseOrderId ?? null,
    invoice_id: params.invoiceId ?? null,
  });

  const db = serviceDb();
  const { data: existing } = await db
    .from("handoffs")
    .select("id")
    .eq("idempotency_key", row.idempotency_key)
    .maybeSingle();
  if (existing) return existing.id;

  const inserted = await db
    .from("handoffs")
    .insert({ ...row, payload: row.payload as never })
    .select("id")
    .single();
  if (inserted.error?.code === "23505") {
    // Lost a race with a retry of the same step: the other insert wins, nothing more to do.
    return must(
      await db.from("handoffs").select("id").eq("idempotency_key", row.idempotency_key).single(),
      "emitHandoff (dup)",
    ).id;
  }
  const handoffId = must(inserted, "emitHandoff").id;

  await recordStep({
    runId: params.runId,
    agent: params.from,
    action: `handoff.emit:${params.type}`,
    input: { to: params.to },
    output: { handoff_id: handoffId, type: params.type, payload: params.payload },
    rationale: params.rationale,
  });
  await enqueue("handoff.process", { handoff_id: handoffId });
  return handoffId;
}
