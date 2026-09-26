import { fetchPurchaseRequest, resolveProductId } from "./queries";
import { draftQuoteMessage, loadVendorPersona, pickLeadTimeDays, pickUnitPrice } from "./personas";
import type { SimJobHandler } from "./types";

// W2: request quotes from each vendor persona. Inserts one vendor_quotes row per vendor and
// enqueues nothing further — Procurement scores and selects once all quotes are in.
export const handleVendorRfq: SimJobHandler<"vendor.rfq"> = async (job, { supabase }) => {
  const { purchase_request_id: purchaseRequestId, vendor_ids: vendorIds } = job.payload;

  const pr = await fetchPurchaseRequest(supabase, purchaseRequestId);
  const productId = await resolveProductId(supabase, pr.deal_id);

  for (const vendorId of vendorIds) {
    const persona = await loadVendorPersona(supabase, vendorId);
    const seedKey = `${purchaseRequestId}:${vendorId}`;

    const unitPrice = pickUnitPrice(persona, productId, seedKey);
    const leadTimeDays = pickLeadTimeDays(persona, seedKey);
    const totalPrice = Math.round(unitPrice * pr.quantity * 100) / 100;
    const message = await draftQuoteMessage(persona, {
      quantity: pr.quantity,
      unitPrice,
      leadTimeDays,
      neededBy: pr.needed_by,
    });

    const { error } = await supabase.from("vendor_quotes").insert({
      purchase_request_id: purchaseRequestId,
      vendor_id: vendorId,
      unit_price: unitPrice,
      lead_time_days: leadTimeDays,
      total_price: totalPrice,
      status: "received",
      message,
    });
    if (error) throw new Error(`handleVendorRfq: insert quote for vendor ${vendorId} failed: ${error.message}`);
  }
};
