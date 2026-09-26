# Golden Path

**Question:** What happens business-wise, including the anomaly pushback?

```mermaid
sequenceDiagram
    actor OM as Ops Manager
    participant Sales
    participant Procurement
    participant Finance
    participant Vendor as Simulated vendor (Northwind/Fabrikam/Contoso)
    participant Customer as Simulated customer (Acme Retail)

    OM->>Sales: mark deal won (run.start, inject_anomaly=true for the demo)
    Sales->>Sales: validateWonDeal(): stage, customer, line items, margin vs target cost
    Sales-->>Procurement: purchase_request.create (qty, needed_by, target_unit_cost)
    Sales-->>Finance: customer_invoice.create (receivable, net 30)
    Finance->>Finance: issueCustomerInvoice()

    Procurement->>Vendor: RFQ to 3 vendors
    Vendor-->>Procurement: quotes (unit_price, lead_time_days, written message)
    Procurement->>Procurement: scoreQuotes(): price 50% / lead time 20% / reliability 30%
    Procurement->>OM: approval requested — PO >= $10,000 threshold
    OM-->>Procurement: approve
    Procurement->>Vendor: issue PO
    Procurement->>Procurement: record simulated goods receipt
    Procurement-->>Finance: vendor_invoice.expect (quoted unit price x quantity)

    Note over Vendor,Finance: The demo "wow": first invoice for this PO is deterministically overbilled ~7-11% (W3)
    Vendor->>Finance: invoice PDF at the inflated unit price
    Finance->>Finance: extractInvoice() vision extraction, then threeWayMatch()
    Finance-->>Procurement: invoice.anomaly (expected vs actual price/qty)

    Procurement->>Procurement: compare invoice to the original quote
    Procurement->>Vendor: dispute message (drafted, citing quote vs invoice)
    Vendor-->>Procurement: corrected invoice PDF at the quoted price
    Procurement-->>Finance: invoice.corrected
    Finance->>Finance: rematchInvoice(): re-run threeWayMatch() -> matched
    Finance->>OM: approval requested — every payment needs finance_controller
    OM-->>Finance: approve
    Finance->>Vendor: payment sent, payable invoice marked paid

    Note over Finance,Customer: The receivable was already issued at step 1; Finance now waits on it
    Customer-->>Finance: customer.payment (on-time or overdue, per run option)
    alt paid on time
        Finance-->>Sales: payment.status (sent)
        Sales->>Sales: deal reflects "fulfilled & collected", account health good
    else overdue
        Finance-->>Sales: receivable.overdue (days_overdue, amount)
        Sales->>Sales: account flagged at_risk; follow-up drafted
    end

    Note over Sales,Customer: checkRunComplete(): payables all paid + receivable settled + no open handoffs -> run marked completed
```

**How to read it:**
- Every arrow between agents is a `handoffs` row, not a direct function call — the orchestrator routes each one through its allow-list before any agent code runs (see `04-technical-architecture.md`).
- The anomaly is deterministic, not random flakiness: `inject_anomaly` on the run makes the *first* invoice for the PO overbill by a seeded ~7-11%, so the demo twist fires every time it's turned on.
- Procurement never takes Finance's word for the mismatch — it re-derives the variance against the original selected quote before drafting the vendor dispute.
- The vendor's dispute reply is itself decided by code (price within tolerance = valid dispute), not the model; only the wording of the reply is AI-generated, and it's treated as untrusted text.
- A run only completes when every vendor invoice for the deal is paid *and* the customer receivable is settled (paid or overdue-and-handed-to-Sales) *and* no handoff is still open — matching §6.5 "closing the loop".

**Sources:** `docs/REQUIREMENTS.md` §6, `web/src/lib/agent/agents/sales.ts`, `procurement.ts`, `finance.ts`, `web/src/lib/agent/orchestrator.ts`, `web/src/lib/sim/personas.ts` (`overbillUnitPrice`), `web/src/lib/sim/vendor-dispute.ts`, `web/src/lib/sim/customer-payment.ts`.
