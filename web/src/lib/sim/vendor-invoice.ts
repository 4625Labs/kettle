import type { SupabaseClient } from "@supabase/supabase-js";
import type { JobPayload } from "@/lib/contracts";
import { renderInvoicePdf } from "@/lib/documents";
import { addDays, todayISO } from "@/lib/documents/dates";
import { fetchPurchaseOrder, fetchPurchaseRequest, fetchRunOptions, fetchSelectedQuote, hasPayableInvoice } from "./queries";
import { loadVendorPersona, overbillUnitPrice } from "./personas";
import { buildInvoiceNumber, fabricateVendorAddress } from "./vendor-details";

const BILL_TO = "Kettle Operations, 4625 Labs Inc.";

export interface GenerateVendorInvoiceParams {
  purchaseOrderId: string;
  runId: string;
  supabase: SupabaseClient;
  enqueue: (kind: "vendor.invoice", payload: JobPayload<"vendor.invoice">) => Promise<void>;
}

// Shared by generateVendorInvoice and the dispute handler's corrected re-issue: build the PDF,
// upload it to the `invoices` bucket, and return the storage path + invoice number.
export async function buildAndUploadInvoicePdf(params: {
  supabase: SupabaseClient;
  vendorName: string;
  vendorId: string;
  poNumber: string;
  description: string;
  quantity: number;
  unitPrice: number;
  corrected?: boolean;
  note?: string;
}): Promise<{ filePath: string; invoiceNumber: string }> {
  const { supabase, vendorName, vendorId, poNumber, description, quantity, unitPrice, corrected, note } = params;
  const invoiceNumber = buildInvoiceNumber(vendorName, poNumber, { corrected });
  const issueDate = todayISO();
  const dueDate = addDays(issueDate, 30);

  const pdfBytes = await renderInvoicePdf({
    vendorName,
    vendorAddress: fabricateVendorAddress(vendorId),
    invoiceNumber,
    poNumber,
    issueDate,
    dueDate,
    billTo: BILL_TO,
    lineItems: [{ description, quantity, unitPrice }],
    note,
  });

  const filePath = `${poNumber}/${invoiceNumber}.pdf`;
  const { error: uploadError } = await supabase.storage
    .from("invoices")
    .upload(filePath, pdfBytes, { contentType: "application/pdf", upsert: true });
  if (uploadError) throw new Error(`buildAndUploadInvoicePdf: upload failed: ${uploadError.message}`);

  return { filePath, invoiceNumber };
}

// W3/W5: build the vendor's invoice PDF and upload it. Called by Procurement right after a PO is
// issued, and again by the dispute handler once a valid dispute is resolved — the anomaly (if the
// run has it flagged) only ever shows up on the FIRST invoice for a PO; a re-issue (this PO
// already has a payable invoice from Finance) always bills the originally quoted price.
export async function generateVendorInvoice(params: GenerateVendorInvoiceParams): Promise<void> {
  const { purchaseOrderId, runId, supabase, enqueue } = params;

  const po = await fetchPurchaseOrder(supabase, purchaseOrderId);
  const pr = await fetchPurchaseRequest(supabase, po.purchase_request_id);
  const persona = await loadVendorPersona(supabase, po.vendor_id);
  const quote = await fetchSelectedQuote(supabase, po.purchase_request_id, po.vendor_id);

  const isFirstInvoice = !(await hasPayableInvoice(supabase, purchaseOrderId));
  const runOptions = await fetchRunOptions(supabase, runId);
  const injectAnomaly = isFirstInvoice && runOptions.inject_anomaly === true;

  const unitPrice = injectAnomaly
    ? overbillUnitPrice(quote.unit_price, `${purchaseOrderId}:anomaly`)
    : quote.unit_price;

  const { filePath, invoiceNumber } = await buildAndUploadInvoicePdf({
    supabase,
    vendorName: persona.vendorName,
    vendorId: po.vendor_id,
    poNumber: po.po_number,
    description: pr.description,
    quantity: pr.quantity,
    unitPrice,
  });

  await enqueue("vendor.invoice", {
    run_id: runId,
    purchase_order_id: purchaseOrderId,
    vendor_id: po.vendor_id,
    file_path: filePath,
    invoice_number: invoiceNumber,
  });
}
