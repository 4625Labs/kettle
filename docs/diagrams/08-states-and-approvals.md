# States & Approvals

**Question:** How do POs, invoices, approvals, and handoffs change state?

```mermaid
stateDiagram-v2
    state "One agent run, five concurrent lifecycles" as ALL {

        state "Purchase order" as PO {
            [*] --> pending_approval : selectVendor(), amount >= threshold ($10k)
            [*] --> issued : selectVendor(), amount below threshold
            pending_approval --> issued : ops_manager approves
            pending_approval --> cancelled : ops_manager rejects
            issued --> fulfilled : goods receipt + vendor invoice paid
        }

        --

        state "Invoice: payable (vendor bill)" as INV {
            [*] --> pending : ingestVendorInvoice() extracted
            pending --> matched : threeWayMatch() no issues
            pending --> anomaly : threeWayMatch() found issues
            anomaly --> pending : Procurement disputes, vendor sends invoice.corrected
            matched --> paid : finance_controller approves the payment
        }

        --

        state "Invoice: receivable (customer bill)" as REC {
            [*] --> pending : issueCustomerInvoice()
            pending --> paid : simulated customer pays on time
            pending --> overdue : simulated customer pays late
        }

        --

        state "Approval" as APR {
            [*] --> pending : requestApproval() — PO, payment, or low-confidence extraction
            pending --> approved : human decides (ops_manager or finance_controller)
            pending --> rejected : human decides
        }

        --

        state "Handoff" as HO {
            [*] --> pending : emitHandoff() — one of 7 allow-listed types
            pending --> processing : orchestrator claims it (handoff.process job)
            processing --> done : allow-listed handler completes
            processing --> failed : handler throws, step cap, or loop limit (K6 escalation)
        }
    }
```

**How to read it:**
- These five lifecycles run concurrently within one agent run — a single deal can have a PO in `pending_approval`, its payable invoice in `anomaly`, and its receivable invoice already `paid`, all at once.
- A PO's approval gate only fires above the policy threshold (default $10,000); below it, `issuePo()` runs immediately with no human step.
- The payable-invoice `anomaly → pending` loop is the demo's pushback moment: Finance hands the mismatch to Procurement, which disputes it with the vendor, and a corrected invoice re-enters at `pending` for another match attempt.
- Every payment requires a `finance_controller` decision no matter the amount — there is no low-value bypass, unlike the PO gate.
- `handoffs.status` also defines a `rejected` value in its check constraint, but no code path in the worker sets it today (only `vendor_quotes.status` reaches `rejected`, when a losing quote is passed over) — shown here only in the PO/invoice states where it's actually reachable.

**Sources:** `web/supabase/migrations/0001_init.sql`, `0002_agents_handoffs_auth.sql`, `0004_run_options_and_approval_jobs.sql`, `0005_po_pending_approval.sql`, `web/src/lib/agent/agents/procurement.ts`, `finance.ts`, `web/src/lib/agent/orchestrator.ts`, `web/src/lib/agent/approvals.ts`.
