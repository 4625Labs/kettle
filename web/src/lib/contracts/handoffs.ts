import { z } from "zod";
import {
  agentSchema,
  handoffStatusSchema,
  handoffTypeSchema,
  uuidSchema,
  type Agent,
  type HandoffType,
} from "./enums";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");

// --- Handoff payloads, one per type in HANDOFF_TYPES ------------------------------------------

// sales -> procurement: a won deal needs stock.
export const purchaseRequestCreatePayload = z.object({
  deal_id: uuidSchema,
  product_id: uuidSchema,
  description: z.string(),
  quantity: z.number().int().positive(),
  needed_by: isoDate,
  target_unit_cost: z.number().positive(),
});
export type PurchaseRequestCreatePayload = z.infer<typeof purchaseRequestCreatePayload>;

// sales -> finance: bill the customer for the won deal.
export const customerInvoiceCreatePayload = z.object({
  deal_id: uuidSchema,
  customer_id: uuidSchema,
  amount: z.number().positive(),
  due_date: isoDate,
});
export type CustomerInvoiceCreatePayload = z.infer<typeof customerInvoiceCreatePayload>;

// procurement -> finance: a PO was issued, a vendor invoice will follow.
export const vendorInvoiceExpectPayload = z.object({
  purchase_order_id: uuidSchema,
  vendor_id: uuidSchema,
  expected_unit_price: z.number().positive(),
  expected_quantity: z.number().int().positive(),
  expected_amount: z.number().positive(),
});
export type VendorInvoiceExpectPayload = z.infer<typeof vendorInvoiceExpectPayload>;

// finance -> procurement: the 3-way match failed (the demo "twist").
export const invoiceAnomalyPayload = z.object({
  invoice_id: uuidSchema,
  purchase_order_id: uuidSchema,
  reason: z.string(),
  expected_unit_price: z.number().positive(),
  actual_unit_price: z.number().positive(),
  expected_quantity: z.number().int().positive(),
  actual_quantity: z.number().int().positive(),
});
export type InvoiceAnomalyPayload = z.infer<typeof invoiceAnomalyPayload>;

// procurement -> finance: vendor issued a corrected invoice after a dispute.
export const invoiceCorrectedPayload = z.object({
  invoice_id: uuidSchema,
  purchase_order_id: uuidSchema,
  corrected_unit_price: z.number().positive(),
  corrected_quantity: z.number().int().positive(),
  note: z.string().optional(),
});
export type InvoiceCorrectedPayload = z.infer<typeof invoiceCorrectedPayload>;

// finance -> sales: payment lifecycle update for a deal's receivable.
export const paymentStatusPayload = z.object({
  deal_id: uuidSchema,
  invoice_id: uuidSchema,
  status: z.enum(["scheduled", "sent", "failed"]),
  amount: z.number().positive(),
  paid_at: z.iso.datetime({ offset: true }).optional(),
});
export type PaymentStatusPayload = z.infer<typeof paymentStatusPayload>;

// finance -> sales: a receivable is overdue, sales should follow up / reflect on account health.
export const receivableOverduePayload = z.object({
  deal_id: uuidSchema,
  invoice_id: uuidSchema,
  days_overdue: z.number().int().positive(),
  amount: z.number().positive(),
});
export type ReceivableOverduePayload = z.infer<typeof receivableOverduePayload>;

export const HANDOFF_PAYLOAD_SCHEMAS = {
  "purchase_request.create": purchaseRequestCreatePayload,
  "customer_invoice.create": customerInvoiceCreatePayload,
  "vendor_invoice.expect": vendorInvoiceExpectPayload,
  "invoice.anomaly": invoiceAnomalyPayload,
  "invoice.corrected": invoiceCorrectedPayload,
  "payment.status": paymentStatusPayload,
  "receivable.overdue": receivableOverduePayload,
} as const satisfies Record<HandoffType, z.ZodTypeAny>;

export type HandoffPayload<T extends HandoffType> = z.infer<(typeof HANDOFF_PAYLOAD_SCHEMAS)[T]>;

export function parseHandoffPayload<T extends HandoffType>(type: T, payload: unknown): HandoffPayload<T> {
  return HANDOFF_PAYLOAD_SCHEMAS[type].parse(payload) as HandoffPayload<T>;
}

// --- Allow-list (K2): the orchestrator must reject any (type, from_agent, to_agent) not here ---

export const HANDOFF_ALLOW_LIST: Record<HandoffType, { from: Agent; to: Agent }> = {
  "purchase_request.create": { from: "sales", to: "procurement" },
  "customer_invoice.create": { from: "sales", to: "finance" },
  "vendor_invoice.expect": { from: "procurement", to: "finance" },
  "invoice.anomaly": { from: "finance", to: "procurement" },
  "invoice.corrected": { from: "procurement", to: "finance" },
  "payment.status": { from: "finance", to: "sales" },
  "receivable.overdue": { from: "finance", to: "sales" },
};

export function isAllowedHandoff(type: HandoffType, from: Agent, to: Agent): boolean {
  const allowed = HANDOFF_ALLOW_LIST[type];
  return allowed.from === from && allowed.to === to;
}

// --- Row shapes -------------------------------------------------------------------------------

const handoffBaseSchema = z.object({
  run_id: uuidSchema.nullable().optional(),
  from_agent: agentSchema,
  to_agent: agentSchema,
  type: handoffTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  idempotency_key: z.string().min(1),
  deal_id: uuidSchema.nullable().optional(),
  purchase_request_id: uuidSchema.nullable().optional(),
  purchase_order_id: uuidSchema.nullable().optional(),
  invoice_id: uuidSchema.nullable().optional(),
});

// What an agent builds before inserting into `handoffs`. Validates the payload shape for its
// declared type and that (type, from_agent, to_agent) is on the allow-list.
export const handoffInsertSchema = handoffBaseSchema.superRefine((h, ctx) => {
  if (!isAllowedHandoff(h.type, h.from_agent, h.to_agent)) {
    ctx.addIssue({
      code: "custom",
      message: `handoff type "${h.type}" may not go from "${h.from_agent}" to "${h.to_agent}"`,
      path: ["type"],
    });
    return;
  }
  const result = HANDOFF_PAYLOAD_SCHEMAS[h.type].safeParse(h.payload);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue({ ...issue, path: ["payload", ...issue.path] });
    }
  }
});
export type HandoffInsert = z.infer<typeof handoffBaseSchema>;

export const handoffRowSchema = handoffBaseSchema.extend({
  id: uuidSchema,
  status: handoffStatusSchema,
  created_at: z.iso.datetime({ offset: true }),
  processed_at: z.iso.datetime({ offset: true }).nullable(),
});
export type HandoffRow = z.infer<typeof handoffRowSchema>;
