// Deterministic stand-in for Sim-world (src/lib/sim, src/lib/documents) until it lands on main.
// Implements the agreed seams exactly, with no LLM calls and no PDFs: the "file path" encodes the
// invoice fields so the extraction stub can read them back. Delete when sim-bridge.ts switches over.
import type { JobKind } from "@/lib/contracts";
import { addDays, isoDate, must, round2, type Db } from "./db";
import type { ExtractedInvoice, SimDeps, SimJobHandler } from "./sim-bridge";

const STUB_LEAD_DAYS: Record<string, number> = {
  "00000000-0000-0000-0000-000000000002": 26, // Northwind: cheap, slow
  "00000000-0000-0000-0000-000000000003": 6, // Fabrikam: premium, fast
  "00000000-0000-0000-0000-000000000004": 12, // Contoso: middle
};

async function productForPr(db: Db, prId: string): Promise<string> {
  const pr = must(await db.from("purchase_requests").select("deal_id").eq("id", prId).single(), "stub pr");
  const line = must(
    await db.from("deal_line_items").select("product_id").eq("deal_id", pr.deal_id!).limit(1).single(),
    "stub line",
  );
  return line.product_id;
}

const vendorRfq: SimJobHandler = async (job, { supabase: db }) => {
  const p = job.payload as { purchase_request_id: string; vendor_ids: string[] };
  const pr = must(await db.from("purchase_requests").select("quantity").eq("id", p.purchase_request_id).single(), "stub pr");
  const productId = await productForPr(db, p.purchase_request_id);
  const { data: personas } = await db.from("vendor_personas").select("vendor_id, price_bands").in("vendor_id", p.vendor_ids);
  const { data: existing } = await db.from("vendor_quotes").select("vendor_id").eq("purchase_request_id", p.purchase_request_id);
  const have = new Set((existing ?? []).map((q) => q.vendor_id));
  for (const persona of personas ?? []) {
    if (have.has(persona.vendor_id)) continue;
    const band = (persona.price_bands as Record<string, { min: number; max: number }>)[productId];
    if (!band) continue;
    // Contoso quotes exactly $195 so the demo numbers line up with the script.
    const unit = persona.vendor_id.endsWith("4") ? 195 : round2((band.min + band.max) / 2);
    must(
      await db
        .from("vendor_quotes")
        .insert({
          purchase_request_id: p.purchase_request_id,
          vendor_id: persona.vendor_id,
          unit_price: unit,
          lead_time_days: STUB_LEAD_DAYS[persona.vendor_id] ?? 14,
          total_price: round2(unit * pr.quantity),
          status: "received",
        })
        .select("id")
        .single(),
      "stub quote",
    );
  }
};

async function makeInvoice(params: {
  purchaseOrderId: string;
  runId: string;
  supabase: Db;
  enqueue: SimDeps["enqueue"];
  correctsInvoiceId?: string;
  vendorMessage?: string;
}) {
  const db = params.supabase;
  const po = must(
    await db.from("purchase_orders").select("id, po_number, vendor_id, purchase_request_id").eq("id", params.purchaseOrderId).single(),
    "stub po",
  );
  const quote = must(
    await db
      .from("vendor_quotes")
      .select("unit_price")
      .eq("purchase_request_id", po.purchase_request_id)
      .eq("vendor_id", po.vendor_id)
      .eq("status", "selected")
      .single(),
    "stub quote",
  );
  const pr = must(await db.from("purchase_requests").select("quantity").eq("id", po.purchase_request_id).single(), "stub pr");
  const run = must(await db.from("agent_runs").select("options").eq("id", params.runId).single(), "stub run");
  const vendor = must(await db.from("companies").select("name").eq("id", po.vendor_id).single(), "stub vendor");

  const inject = !params.correctsInvoiceId && (run.options as Record<string, unknown>)?.inject_anomaly === true;
  // W3: $195 quoted -> $212 billed (+8.7%, over the 5% tolerance).
  const unit = inject ? round2(Number(quote.unit_price) * (212 / 195)) : Number(quote.unit_price);
  const suffix = params.correctsInvoiceId ? "-C" : "";
  const invoiceNumber = `${vendor.name.split(" ")[0].toUpperCase().slice(0, 4)}-${po.po_number.replace(/\D/g, "")}${suffix}`;
  const fields: ExtractedInvoice["fields"] = {
    invoice_number: invoiceNumber,
    po_number: po.po_number,
    vendor_name: vendor.name,
    quantity: pr.quantity,
    unit_price: unit,
    total: round2(unit * pr.quantity),
    due_date: isoDate(addDays(new Date(), 30)),
  };
  const filePath = `stub/${invoiceNumber}.json?${new URLSearchParams(
    Object.entries(fields).map(([k, v]) => [k, String(v)]),
  ).toString()}`;

  await params.enqueue("vendor.invoice", {
    run_id: params.runId,
    purchase_order_id: po.id,
    vendor_id: po.vendor_id,
    file_path: filePath,
    invoice_number: invoiceNumber,
    ...(params.correctsInvoiceId ? { corrects_invoice_id: params.correctsInvoiceId } : {}),
    ...(params.vendorMessage ? { vendor_message: params.vendorMessage } : {}),
  });
}

export async function generateVendorInvoice(params: {
  purchaseOrderId: string;
  runId: string;
  supabase: Db;
  enqueue: SimDeps["enqueue"];
}) {
  await makeInvoice(params);
}

const vendorDispute: SimJobHandler = async (job, deps) => {
  const p = job.payload as { run_id: string; purchase_order_id: string; invoice_id: string };
  await makeInvoice({
    purchaseOrderId: p.purchase_order_id,
    runId: p.run_id,
    supabase: deps.supabase,
    enqueue: deps.enqueue,
    correctsInvoiceId: p.invoice_id,
    vendorMessage: "Apologies, our billing system applied last quarter's list price. Corrected invoice attached at the quoted rate.",
  });
};

const customerPayment: SimJobHandler = async (job, { supabase: db, enqueue }) => {
  const p = job.payload as { run_id: string; invoice_id: string; on_time?: boolean };
  const inv = must(await db.from("invoices").select("id, amount").eq("id", p.invoice_id).single(), "stub receivable");
  const status = p.on_time === false ? "overdue" : "paid";
  if (status === "paid") {
    must(
      await db.from("payments").insert({ invoice_id: inv.id, amount: inv.amount, status: "sent", paid_at: new Date().toISOString() }).select("id").single(),
      "stub payment",
    );
  }
  await db.from("invoices").update({ status }).eq("id", inv.id);
  await enqueue("customer.paid", { runId: p.run_id, invoiceId: inv.id, status });
};

export const simHandlers: Partial<Record<JobKind, SimJobHandler>> = {
  "vendor.rfq": vendorRfq,
  "vendor.dispute": vendorDispute,
  "customer.payment": customerPayment,
};

export async function extractInvoice(filePath: string): Promise<ExtractedInvoice> {
  const started = Date.now();
  const q = new URLSearchParams(filePath.split("?")[1] ?? "");
  const fields: ExtractedInvoice["fields"] = {
    invoice_number: q.get("invoice_number") ?? "",
    po_number: q.get("po_number") ?? "",
    vendor_name: q.get("vendor_name") ?? "",
    quantity: Number(q.get("quantity")),
    unit_price: Number(q.get("unit_price")),
    total: Number(q.get("total")),
    due_date: q.get("due_date") ?? "",
  };
  if (!fields.invoice_number || !Number.isFinite(fields.unit_price)) {
    throw new Error(`stub extractInvoice: unreadable file ${filePath}`);
  }
  const confidence = Object.fromEntries(Object.keys(fields).map((k) => [k, 0.98]));
  return { fields, confidence, model: "stub-extractor", latencyMs: Date.now() - started };
}
