# Data Model

**Question:** What's in the shared ledger?

```mermaid
erDiagram
    COMPANIES ||--o{ CONTACTS : has
    COMPANIES ||--o{ DEALS : "is customer for"
    COMPANIES ||--o{ VENDOR_QUOTES : quotes
    COMPANIES ||--|| VENDOR_PERSONAS : "is vendor for"
    COMPANIES ||--o{ PURCHASE_ORDERS : "is vendor for"
    COMPANIES ||--o{ INVOICES : "is vendor for (payable)"

    PRODUCTS ||--o{ DEAL_LINE_ITEMS : "is product for"
    DEALS ||--o{ DEAL_LINE_ITEMS : contains
    DEALS ||--o{ PURCHASE_REQUESTS : "creates need for"
    DEALS ||--o| INVOICES : "bills receivable"

    PURCHASE_REQUESTS ||--o{ VENDOR_QUOTES : "requests quotes for"
    PURCHASE_REQUESTS ||--o| PURCHASE_ORDERS : awards
    PURCHASE_ORDERS ||--o{ GOODS_RECEIPTS : receives
    PURCHASE_ORDERS ||--o{ INVOICES : "is billed by (payable)"
    INVOICES ||--o{ PAYMENTS : "is paid by"

    AGENT_RUNS ||--o{ AGENT_STEPS : logs
    AGENT_RUNS ||--o{ HANDOFFS : carries
    AGENT_RUNS ||--o{ APPROVALS : "gates on"
    HANDOFFS ||--o| JOBS : "enqueues handoff.process"
    APPROVALS ||--o| JOBS : "enqueues approval.decided (0004 trigger)"
    APPROVALS }o--|| PROFILES : decided_by

    COMPANIES {
        uuid id PK
        text name
        text kind "customer, vendor, or both"
    }
    DEALS {
        uuid id PK
        text stage "qualifying, quoted, won, lost"
        numeric value
    }
    PURCHASE_REQUESTS {
        uuid id PK
        text status "open, comparing, awarded, cancelled"
        date needed_by
    }
    VENDOR_QUOTES {
        uuid id PK
        numeric unit_price
        integer lead_time_days
        text status "requested, received, selected, rejected"
        text message "persona's written quote (0006)"
    }
    VENDOR_PERSONAS {
        uuid vendor_id PK
        numeric reliability "0-1, drives lead time + P3 score"
        jsonb price_bands "min/max per product_id"
    }
    PURCHASE_ORDERS {
        uuid id PK
        text po_number
        numeric amount
        text status "pending_approval, issued, fulfilled, cancelled"
    }
    GOODS_RECEIPTS {
        uuid id PK
        integer quantity
        text status "received, short, damaged"
    }
    INVOICES {
        uuid id PK
        text direction "payable or receivable"
        text status "pending, matched, anomaly, paid, overdue"
        numeric extraction_confidence "F6, vision model certainty"
    }
    PAYMENTS {
        uuid id PK
        text status "scheduled, sent, failed"
    }
    HANDOFFS {
        uuid id PK
        text type "one of 7 allow-listed types"
        text status "pending, processing, done, failed, rejected"
        text idempotency_key UK
    }
    APPROVALS {
        uuid id PK
        text subject_type "purchase_order, payment, invoice_correction"
        text required_role "ops_manager or finance_controller"
        text status "pending, approved, rejected"
    }
    JOBS {
        uuid id PK
        text kind "run.start, handoff.process, vendor.rfq, ..."
        text status "queued, running, done, failed"
    }
    AGENT_RUNS {
        uuid id PK
        text agent "sales, procurement, finance, orchestrator"
        text status "running, completed, failed"
        jsonb options "inject_anomaly, customer_pays_late"
    }
    AGENT_STEPS {
        uuid id PK
        text agent
        text action
        text status "ok, error, flagged"
        text rationale
        text model
    }
    PROFILES {
        uuid id PK
        text role "ops_manager, sales_rep, finance_controller"
    }
```

**How to read it:**
- Two parallel spines meet at `deals`: the sales/procurement/finance business ledger (top) and the agent execution trail (`agent_runs`/`agent_steps`/`handoffs`/`approvals`, bottom) that is the product's live UI, not a side log.
- `handoffs` and `approvals` don't call the worker directly — they only ever produce a `jobs` row (via `emitHandoff`'s own insert, or the `0004` trigger for approvals), and the worker's `claim_job()` is what actually resumes work.
- `purchase_orders` carries no unit price or quantity of its own; those live on the selected `vendor_quotes` row and the `purchase_requests` row (a deliberate join, not a gap).
- `invoices` is one table for both directions — `payable` (vendor bills) and `receivable` (customer bills) — distinguished by `direction`, which is why F2/F3 (payable) and F5 (receivable) share a status vocabulary.
- `handoffs.status` defines a `rejected` value in the schema, but no code path sets it today — only `vendor_quotes.status` actually reaches `rejected` (the losing quotes after vendor selection).

**Sources:** `web/supabase/migrations/0001_init.sql`, `0002_agents_handoffs_auth.sql`, `0004_run_options_and_approval_jobs.sql`, `0005_po_pending_approval.sql`, `0006_vendor_messages.sql`, `web/src/lib/contracts/enums.ts`, `web/src/lib/agent/entities.ts`.
