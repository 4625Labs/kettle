import { fetchInvoice, fetchRunOptions } from "./queries";
import type { SimJobHandler } from "./types";

// W4/P1: the simulated customer settles (or misses) a receivable. `on_time` on the payload wins
// when the caller supplies it; otherwise we fall back to the run's `customer_pays_late` option
// (mirrors the inject_anomaly pattern), defaulting to on-time. "Late" here means still unpaid at
// the due date (overdue), matching invoices.status and feeding F5's follow-up flow — not a late
// payment that still lands, which would double up with the 'paid' status.
export const handleCustomerPayment: SimJobHandler<"customer.payment"> = async (job, { supabase, enqueue }) => {
  const { run_id: runId, invoice_id: invoiceId, on_time: onTimeOverride } = job.payload;

  const invoice = await fetchInvoice(supabase, invoiceId);
  const runOptions = await fetchRunOptions(supabase, runId);
  const paysOnTime = onTimeOverride ?? runOptions.customer_pays_late !== true;

  if (paysOnTime) {
    const { error: paymentError } = await supabase.from("payments").insert({
      invoice_id: invoiceId,
      amount: invoice.amount,
      status: "sent",
      paid_at: new Date().toISOString(),
    });
    if (paymentError) throw new Error(`handleCustomerPayment: insert payment failed: ${paymentError.message}`);
  }

  const status = paysOnTime ? "paid" : "overdue";
  const { error: invoiceError } = await supabase.from("invoices").update({ status }).eq("id", invoiceId);
  if (invoiceError) throw new Error(`handleCustomerPayment: update invoice failed: ${invoiceError.message}`);

  await enqueue("customer.paid", { runId, invoiceId, status });
};
