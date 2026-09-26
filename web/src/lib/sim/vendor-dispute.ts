import { fetchInvoice, fetchMatchTolerancePct, fetchPurchaseOrder, fetchPurchaseRequest, fetchSelectedQuote } from "./queries";
import { draftDisputeReply, loadVendorPersona } from "./personas";
import { buildAndUploadInvoicePdf } from "./vendor-invoice";
import type { SimJobHandler } from "./types";

// P5/W2: the vendor persona responds to a dispute. Code (not the model) decides whether the
// dispute is valid, by comparing the billed price to the originally quoted one within policy
// tolerance. A valid dispute gets a corrected invoice PDF and enqueues vendor.invoice with
// corrects_invoice_id set; an invalid one just gets a reply defending the price.
export const handleVendorDispute: SimJobHandler<"vendor.dispute"> = async (job, { supabase, enqueue }) => {
  const { run_id: runId, purchase_order_id: purchaseOrderId, invoice_id: invoiceId, reason } = job.payload;

  const po = await fetchPurchaseOrder(supabase, purchaseOrderId);
  const pr = await fetchPurchaseRequest(supabase, po.purchase_request_id);
  const persona = await loadVendorPersona(supabase, po.vendor_id);
  const quote = await fetchSelectedQuote(supabase, po.purchase_request_id, po.vendor_id);
  const invoice = await fetchInvoice(supabase, invoiceId);

  if (invoice.unit_price == null) {
    throw new Error(`handleVendorDispute: invoice ${invoiceId} has no unit_price to compare`);
  }

  const tolerancePct = await fetchMatchTolerancePct(supabase);
  const deltaPct = (Math.abs(invoice.unit_price - quote.unit_price) / quote.unit_price) * 100;
  const valid = deltaPct > tolerancePct;

  const vendorMessage = await draftDisputeReply(persona, {
    valid,
    quotedPrice: quote.unit_price,
    billedPrice: invoice.unit_price,
    reason,
  });

  if (!valid) return;

  const { filePath, invoiceNumber } = await buildAndUploadInvoicePdf({
    supabase,
    vendorName: persona.vendorName,
    vendorId: po.vendor_id,
    poNumber: po.po_number,
    description: pr.description,
    quantity: pr.quantity,
    unitPrice: quote.unit_price,
    corrected: true,
    note: `Corrected invoice — supersedes ${invoice.invoice_number}.`,
  });

  await enqueue("vendor.invoice", {
    run_id: runId,
    purchase_order_id: purchaseOrderId,
    vendor_id: po.vendor_id,
    file_path: filePath,
    invoice_number: invoiceNumber,
    corrects_invoice_id: invoiceId,
    vendor_message: vendorMessage,
  });
};
