import { requireSession } from "@/app/_lib/session";
import { getDealLifecycle } from "./_lib/data";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-foreground/50">{title}</h2>
      {children}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "issued" || status === "approved" || status === "paid" || status === "done" || status === "matched"
      ? "border-resolved/40 bg-resolved/10 text-resolved"
      : status === "cancelled" || status === "rejected" || status === "failed" || status === "anomaly"
        ? "border-anomaly/40 bg-anomaly/10 text-anomaly"
        : "border-border text-foreground/60";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide ${tone}`}>
      {status.replace("_", " ")}
    </span>
  );
}

function money(n: number) {
  return `$${Number(n).toLocaleString()}`;
}

export default async function DealsPage() {
  await requireSession();
  const lifecycle = await getDealLifecycle();

  if (!lifecycle) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
        <p className="text-sm text-foreground/50">No deal yet.</p>
      </div>
    );
  }

  const { deal, lineItems, purchaseRequests, quotes, purchaseOrders, invoices, payments } = lifecycle;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-10">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">{deal.title}</h1>
        <p className="mt-1 text-sm text-foreground/60">
          {deal.company?.name ?? "Unknown customer"} · {money(Number(deal.value))} ·{" "}
          <StatusBadge status={deal.stage} />
        </p>
      </div>

      {lineItems.length > 0 && (
        <Section title="Line items">
          <ul className="flex flex-col gap-1 text-sm">
            {lineItems.map((li) => (
              <li key={li.id} className="flex justify-between">
                <span>{li.product?.name ?? li.product_id}</span>
                <span className="text-foreground/60">
                  {li.quantity} × {money(Number(li.unit_price))}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {purchaseRequests.length === 0 ? (
        <p className="text-sm text-foreground/40">
          No purchase request yet — start the golden-path scenario from the run view.
        </p>
      ) : (
        <>
          <Section title="Purchase request">
            {purchaseRequests.map((pr) => (
              <div key={pr.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm">
                <span>
                  {pr.description} — {pr.quantity} units, needed by {pr.needed_by ?? "—"}
                </span>
                <StatusBadge status={pr.status} />
              </div>
            ))}
          </Section>

          <Section title="Vendor quotes">
            {quotes.length === 0 ? (
              <p className="text-sm text-foreground/40">Waiting on RFQ responses.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {quotes.map((q) => (
                  <div key={q.id} className="rounded-lg border border-border bg-surface p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{q.vendor?.name ?? q.vendor_id}</span>
                      <span className="text-foreground/60">
                        {money(Number(q.unit_price))}/unit · {q.lead_time_days}d lead ·{" "}
                        {money(Number(q.total_price))} total
                      </span>
                      <StatusBadge status={q.status} />
                    </div>
                    {q.message && <p className="mt-1 text-xs text-foreground/60">{q.message}</p>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Purchase order">
            {purchaseOrders.length === 0 ? (
              <p className="text-sm text-foreground/40">No vendor selected yet.</p>
            ) : (
              purchaseOrders.map((po) => (
                <div key={po.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {po.po_number} — {po.vendor?.name ?? po.vendor_id}
                    </span>
                    <span className="flex items-center gap-2">
                      <span>{money(Number(po.amount))}</span>
                      <StatusBadge status={po.status} />
                    </span>
                  </div>
                  {po.approval && (
                    <p className="mt-1 text-xs text-foreground/50">
                      Approval: <StatusBadge status={po.approval.status} />
                      {po.approval.note ? ` — "${po.approval.note}"` : ""}
                    </p>
                  )}
                </div>
              ))
            )}
          </Section>

          <Section title="Invoices">
            {invoices.length === 0 ? (
              <p className="text-sm text-foreground/40">No invoices yet.</p>
            ) : (
              invoices.map((inv) => (
                <div key={inv.id} className="rounded-lg border border-border bg-surface p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">
                      {inv.invoice_number}
                      <span className="ml-2 text-xs uppercase text-foreground/40">
                        {inv.direction}
                        {inv.vendor ? ` · ${inv.vendor.name}` : ""}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span>{money(Number(inv.amount))}</span>
                      <StatusBadge status={inv.status} />
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-foreground/50">Due {inv.due_date}</p>
                  {inv.extracted != null && (
                    <pre className="mt-2 overflow-x-auto rounded-md border border-border bg-background p-2 text-xs">
                      {JSON.stringify(inv.extracted, null, 2)}
                      {inv.extraction_confidence != null
                        ? `\n\nconfidence: ${inv.extraction_confidence}`
                        : ""}
                    </pre>
                  )}
                </div>
              ))
            )}
          </Section>

          {payments.length > 0 && (
            <Section title="Payments">
              {payments.map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-surface p-3 text-sm">
                  <span>{money(Number(p.amount))}</span>
                  <span className="flex items-center gap-2">
                    {p.paid_at && <span className="text-foreground/50">{p.paid_at}</span>}
                    <StatusBadge status={p.status} />
                  </span>
                </div>
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
