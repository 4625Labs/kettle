import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/types";

export interface DealLifecycle {
  deal: Tables<"deals"> & { company: Tables<"companies"> | null };
  lineItems: (Tables<"deal_line_items"> & { product: Tables<"products"> | null })[];
  purchaseRequests: Tables<"purchase_requests">[];
  // TODO(data): drop `message` here once types.ts is regenerated — migration
  // 0006 added vendor_quotes.message but the generated types predate it.
  quotes: (Tables<"vendor_quotes"> & { message: string | null; vendor: Tables<"companies"> | null })[];
  purchaseOrders: (Tables<"purchase_orders"> & {
    vendor: Tables<"companies"> | null;
    approval: Tables<"approvals"> | null;
  })[];
  invoices: (Tables<"invoices"> & { vendor: Tables<"companies"> | null })[];
  payments: Tables<"payments">[];
}

// One demo deal for this whole app (S1 create/edit is out of scope for the
// hackathon) — so "the deal" is just the earliest one, same lookup Start
// scenario uses.
export async function getDealLifecycle(): Promise<DealLifecycle | null> {
  const supabase = await createClient();

  const { data: deal } = await supabase
    .from("deals")
    .select("*, company:companies(*)")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!deal) return null;

  const { data: lineItems } = await supabase
    .from("deal_line_items")
    .select("*, product:products(*)")
    .eq("deal_id", deal.id);

  const { data: purchaseRequests } = await supabase
    .from("purchase_requests")
    .select("*")
    .eq("deal_id", deal.id)
    .order("created_at");

  const prIds = (purchaseRequests ?? []).map((pr) => pr.id);

  const [{ data: quotes }, { data: purchaseOrders }] = await Promise.all([
    prIds.length
      ? supabase
          .from("vendor_quotes")
          .select("*, vendor:companies(*)")
          .in("purchase_request_id", prIds)
          .order("submitted_at")
      : Promise.resolve({ data: [] }),
    prIds.length
      ? supabase
          .from("purchase_orders")
          .select("*, vendor:companies(*)")
          .in("purchase_request_id", prIds)
          .order("created_at")
      : Promise.resolve({ data: [] }),
  ]);

  const poIds = (purchaseOrders ?? []).map((po) => po.id);

  const [{ data: approvals }, { data: invoicesData }] = await Promise.all([
    poIds.length
      ? supabase.from("approvals").select("*").eq("subject_type", "purchase_order").in("subject_id", poIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("invoices")
      .select("*, vendor:companies(*)")
      .or([`deal_id.eq.${deal.id}`, poIds.length ? `purchase_order_id.in.(${poIds.join(",")})` : ""].filter(Boolean).join(","))
      .order("created_at"),
  ]);

  const invoiceIds = (invoicesData ?? []).map((inv) => inv.id);
  const { data: payments } = invoiceIds.length
    ? await supabase.from("payments").select("*").in("invoice_id", invoiceIds)
    : { data: [] };

  const purchaseOrdersWithApproval = (purchaseOrders ?? []).map((po) => ({
    ...po,
    approval: (approvals ?? []).find((a) => a.subject_id === po.id) ?? null,
  }));

  return {
    deal,
    lineItems: lineItems ?? [],
    purchaseRequests: purchaseRequests ?? [],
    quotes: quotes ?? [],
    purchaseOrders: purchaseOrdersWithApproval,
    invoices: invoicesData ?? [],
    payments: payments ?? [],
  };
}
