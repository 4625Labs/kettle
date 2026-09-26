// Loaders that join the ledger rows an agent needs. purchase_orders carries no unit price or
// quantity: those come from the selected vendor quote and the purchase request (agreed with lead).
import { purchaseRequestCreatePayload, type PurchaseRequestCreatePayload } from "@/lib/contracts";
import { must, serviceDb } from "./db";

export interface PoContext {
  po: { id: string; po_number: string; vendor_id: string; amount: number; status: string; purchase_request_id: string };
  pr: { id: string; deal_id: string | null; quantity: number; needed_by: string | null; description: string };
  quote: { id: string; unit_price: number; lead_time_days: number } | null;
  vendorName: string;
  unitPrice: number;
  quantity: number;
}

export async function loadPoContext(poId: string): Promise<PoContext> {
  const db = serviceDb();
  const po = must(
    await db.from("purchase_orders").select("id, po_number, vendor_id, amount, status, purchase_request_id").eq("id", poId).single(),
    "load PO",
  );
  const pr = must(
    await db.from("purchase_requests").select("id, deal_id, quantity, needed_by, description").eq("id", po.purchase_request_id).single(),
    "load PR",
  );
  const { data: quote } = await db
    .from("vendor_quotes")
    .select("id, unit_price, lead_time_days")
    .eq("purchase_request_id", pr.id)
    .eq("vendor_id", po.vendor_id)
    .eq("status", "selected")
    .maybeSingle();
  const vendor = must(await db.from("companies").select("name").eq("id", po.vendor_id).single(), "load vendor");
  const quantity = pr.quantity;
  const unitPrice = quote ? Number(quote.unit_price) : Number(po.amount) / quantity;
  return {
    po: { ...po, amount: Number(po.amount) },
    pr,
    quote: quote ? { ...quote, unit_price: Number(quote.unit_price) } : null,
    vendorName: vendor.name,
    unitPrice,
    quantity,
  };
}

/** The Sales handoff that created a purchase request (holds product and target cost). */
export async function purchaseRequestOrigin(prId: string): Promise<PurchaseRequestCreatePayload> {
  const h = must(
    await serviceDb()
      .from("handoffs")
      .select("payload")
      .eq("purchase_request_id", prId)
      .eq("type", "purchase_request.create")
      .limit(1)
      .single(),
    "load PR origin handoff",
  );
  return purchaseRequestCreatePayload.parse(h.payload);
}

export async function receivedQuantity(poId: string): Promise<number> {
  const { data } = await serviceDb().from("goods_receipts").select("quantity, status").eq("purchase_order_id", poId);
  return (data ?? []).filter((r) => r.status !== "damaged").reduce((s, r) => s + r.quantity, 0);
}
