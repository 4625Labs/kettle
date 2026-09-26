import type { SupabaseClient } from "@supabase/supabase-js";

// Small, narrowly-typed reads shared by the sim handlers. `createServiceRoleClient()` isn't typed
// against the generated schema (see src/lib/supabase/server.ts), so we assert the shape we need
// at each call site instead of trusting `any`.

export interface PurchaseRequestRow {
  id: string;
  deal_id: string | null;
  description: string;
  quantity: number;
  needed_by: string | null;
}

export async function fetchPurchaseRequest(
  supabase: SupabaseClient,
  purchaseRequestId: string,
): Promise<PurchaseRequestRow> {
  const { data, error } = await supabase
    .from("purchase_requests")
    .select("id, deal_id, description, quantity, needed_by")
    .eq("id", purchaseRequestId)
    .single();
  if (error) throw new Error(`fetchPurchaseRequest(${purchaseRequestId}): ${error.message}`);
  return data as PurchaseRequestRow;
}

export interface PurchaseOrderRow {
  id: string;
  po_number: string;
  purchase_request_id: string;
  vendor_id: string;
  amount: number;
  status: string;
}

export async function fetchPurchaseOrder(
  supabase: SupabaseClient,
  purchaseOrderId: string,
): Promise<PurchaseOrderRow> {
  const { data, error } = await supabase
    .from("purchase_orders")
    .select("id, po_number, purchase_request_id, vendor_id, amount, status")
    .eq("id", purchaseOrderId)
    .single();
  if (error) throw new Error(`fetchPurchaseOrder(${purchaseOrderId}): ${error.message}`);
  return data as PurchaseOrderRow;
}

// A deal has exactly one line item in the current seed/demo shape; purchase_requests has no
// product_id of its own, so we resolve the product through the deal it was raised from.
export async function resolveProductId(
  supabase: SupabaseClient,
  dealId: string | null,
): Promise<string> {
  if (!dealId) throw new Error("resolveProductId: purchase request has no deal_id");
  const { data, error } = await supabase
    .from("deal_line_items")
    .select("product_id")
    .eq("deal_id", dealId)
    .limit(1)
    .single();
  if (error) throw new Error(`resolveProductId(deal ${dealId}): ${error.message}`);
  return (data as { product_id: string }).product_id;
}

export interface VendorQuoteRow {
  id: string;
  purchase_request_id: string;
  vendor_id: string;
  unit_price: number;
  lead_time_days: number;
  total_price: number;
  status: string;
}

// The quote a PO was issued against — the "ground truth" price a vendor invoice is matched to.
export async function fetchSelectedQuote(
  supabase: SupabaseClient,
  purchaseRequestId: string,
  vendorId: string,
): Promise<VendorQuoteRow> {
  const { data, error } = await supabase
    .from("vendor_quotes")
    .select("id, purchase_request_id, vendor_id, unit_price, lead_time_days, total_price, status")
    .eq("purchase_request_id", purchaseRequestId)
    .eq("vendor_id", vendorId)
    .order("submitted_at", { ascending: false })
    .limit(1)
    .single();
  if (error) throw new Error(`fetchSelectedQuote(${purchaseRequestId}, ${vendorId}): ${error.message}`);
  return data as VendorQuoteRow;
}

export interface InvoiceRow {
  id: string;
  invoice_number: string;
  purchase_order_id: string | null;
  unit_price: number | null;
  quantity: number | null;
  amount: number;
  due_date: string;
}

export async function fetchInvoice(supabase: SupabaseClient, invoiceId: string): Promise<InvoiceRow> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id, invoice_number, purchase_order_id, unit_price, quantity, amount, due_date")
    .eq("id", invoiceId)
    .single();
  if (error) throw new Error(`fetchInvoice(${invoiceId}): ${error.message}`);
  return data as InvoiceRow;
}

// True once Finance has ingested at least one payable invoice for this PO — i.e. this is a
// re-issue after a dispute, so the anomaly (if any) has already been shown and must not repeat.
export async function hasPayableInvoice(supabase: SupabaseClient, purchaseOrderId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("invoices")
    .select("id")
    .eq("purchase_order_id", purchaseOrderId)
    .eq("direction", "payable")
    .limit(1);
  if (error) throw new Error(`hasPayableInvoice(${purchaseOrderId}): ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function fetchRunOptions(supabase: SupabaseClient, runId: string): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.from("agent_runs").select("options").eq("id", runId).single();
  if (error) throw new Error(`fetchRunOptions(${runId}): ${error.message}`);
  return ((data as { options: Record<string, unknown> | null }).options ?? {}) as Record<string, unknown>;
}

export async function fetchMatchTolerancePct(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.from("policies").select("value").eq("key", "match_tolerance_pct").single();
  if (error) throw new Error(`fetchMatchTolerancePct: ${error.message}`);
  const value = (data as { value: { percent?: number } }).value;
  return value?.percent ?? 5;
}
