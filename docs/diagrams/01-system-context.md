# System Context

**Question:** Who and what does Kettle interact with?

```mermaid
flowchart LR
    classDef sales fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A
    classDef procurement fill:#EDE9FE,stroke:#7C3AED,color:#4C1D95
    classDef finance fill:#DCFCE7,stroke:#16A34A,color:#14532D
    classDef orchestrator fill:#F3F4F6,stroke:#4B5563,color:#111827
    classDef human fill:#FEF3C7,stroke:#D97706,color:#78350F
    classDef external fill:#FFFFFF,stroke:#9CA3AF,color:#374151,stroke-dasharray:4 3
    classDef vultr fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E

    subgraph HUMANS["Signed-in humans (one login, switchable roles)"]
        OM["Ops Manager"]:::human
        SR["Sales Rep"]:::human
        FC["Finance Controller"]:::human
    end

    KETTLE[["Kettle: Sales + Procurement + Finance agents<br/>over an AI orchestrator"]]:::orchestrator

    VENDORS["Simulated vendors (AI personas):<br/>Northwind Supply, Fabrikam Parts, Contoso Distribution"]:::external
    CUSTOMER["Simulated customer: Acme Retail Co."]:::external
    LLM["Vultr Serverless Inference<br/>(deepseek-v4.1-flash, laguna-s-2.1, glm-5.3-flash)"]:::vultr
    DB[("Supabase: Postgres ledger, Auth, Realtime, Storage")]:::vultr
    NETBIRD["NetBird reverse proxy<br/>kettle.4625labs.com (password-gated)"]:::vultr

    OM -->|"start run, inject anomaly, approve PO/payment"| KETTLE
    SR -->|"mark a deal won"| KETTLE
    FC -->|"approve payments"| KETTLE
    KETTLE -->|"live run view, approvals inbox"| HUMANS

    KETTLE -->|"RFQ, dispute message"| VENDORS
    VENDORS -->|"quote, invoice PDF (overbilled first, then corrected)"| KETTLE

    KETTLE -->|"customer invoice (receivable)"| CUSTOMER
    CUSTOMER -->|"payment: on-time or overdue"| KETTLE

    KETTLE -->|"agent reasoning, vendor persona text, invoice vision extraction"| LLM
    KETTLE <-->|"ledger reads/writes, job queue, realtime, invoice PDFs"| DB
    HUMANS -->|"only public path in"| NETBIRD --> KETTLE
```

**How to read it:**
- Three humans (one seeded login, switchable role) drive Kettle by marking deals won and clearing approval gates; everything else the agents do themselves.
- Vendors and the customer are simulated: vendor personas are AI-played (bounded prices, untrusted text) and reply to RFQs, disputes, and invoices; the customer simulator pays on time or late.
- Every LLM call — agent reasoning, vendor persona text, invoice-image extraction — goes to Vultr Serverless Inference; no other AI provider is used.
- Supabase is the one shared ledger and also carries the job queue and realtime feed that makes the run view live.
- The public internet never reaches Kettle directly: NetBird's password-gated reverse proxy is the only way in (see `03-request-path.md`).

**Sources:** `docs/REQUIREMENTS.md` (§1-2, §5-6, §14), `docs/STATUS.md`, `web/supabase/seed.sql`, `web/src/lib/sim/personas.ts`, `web/src/lib/agent/inference.ts`, `web/src/lib/documents/vision.ts`, `infra/NETBIRD.md`.
