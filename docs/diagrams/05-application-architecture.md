# Application Architecture

**Question:** How is the code organized (orchestrator, agents, sim, documents, contracts, ledger)?

```mermaid
flowchart TB
    classDef sales fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A
    classDef procurement fill:#EDE9FE,stroke:#7C3AED,color:#4C1D95
    classDef finance fill:#DCFCE7,stroke:#16A34A,color:#14532D
    classDef orchestrator fill:#F3F4F6,stroke:#4B5563,color:#111827
    classDef external fill:#FFFFFF,stroke:#9CA3AF,color:#374151,stroke-dasharray:4 3

    CONTRACTS["src/lib/contracts/*: enums, handoffs, jobs, approvals<br/>— zod payload schemas + the handoff allow-list"]:::orchestrator
    WORKERENTRY["web/worker/index.ts + loop.ts<br/>claim_job() poll loop, retries, lease reaper"]:::orchestrator
    DISPATCH["agent/dispatch.ts: JobKind -> handler"]:::orchestrator
    ORCH["agent/orchestrator.ts: routeEvent() against the allow-list,<br/>step cap + loop detection"]:::orchestrator
    RULES["agent/rules.ts: scoreQuotes, threeWayMatch,<br/>validateDeal (deterministic, no I/O)"]:::orchestrator
    LEDGER["agent/ledger.ts: startRun, recordStep, completeRun"]:::orchestrator
    SUPPORT["agent/handoffs.ts, approvals.ts, queue.ts, policies.ts<br/>emitHandoff, requestApproval, enqueue, loadPolicies"]:::orchestrator
    LLMMOD["agent/llm.ts + inference.ts<br/>decide() / callTool() against Vultr, with a code fallback"]:::orchestrator

    SALESF["agent/agents/sales.ts"]:::sales
    PROCF["agent/agents/procurement.ts"]:::procurement
    FINF["agent/agents/finance.ts"]:::finance

    SIMWORLD["src/lib/sim/*: personas, vendor-rfq, vendor-dispute,<br/>vendor-invoice, customer-payment, safety (sanitizePersonaText)"]:::external
    DOCUMENTS["src/lib/documents/*: extract-invoice, render-pdf (pdftoppm),<br/>vision, invoice-pdf"]:::external

    WORKERENTRY --> DISPATCH
    DISPATCH -->|"handoff.process"| ORCH
    DISPATCH -->|"vendor.rfq / vendor.dispute / customer.payment"| SIMWORLD
    ORCH -->|"allow-listed route"| SALESF
    ORCH -->|"allow-listed route"| PROCF
    ORCH -->|"allow-listed route"| FINF

    SALESF --> RULES
    PROCF --> RULES
    FINF --> RULES
    SALESF --> LEDGER
    PROCF --> LEDGER
    FINF --> LEDGER
    SALESF --> SUPPORT
    PROCF --> SUPPORT
    FINF --> SUPPORT
    SALESF -.-> LLMMOD
    PROCF -.-> LLMMOD
    FINF -.-> LLMMOD

    PROCF -->|"generateVendorInvoice()"| DOCUMENTS
    FINF -->|"extractInvoice()"| DOCUMENTS
    SIMWORLD -.-> LLMMOD
    SIMWORLD -->|"corrected invoice PDF, dispute reply"| PROCF

    ORCH --> CONTRACTS
    SUPPORT --> CONTRACTS
    DISPATCH --> CONTRACTS
```

**How to read it:**
- `contracts/*` is the shared vocabulary: every handoff and job payload is zod-validated against it, and the handoff allow-list here is the same one `orchestrator.ts` enforces at runtime (it throws at import time if they disagree).
- `rules.ts` holds every number Kettle computes — vendor scoring weights, 3-way match tolerance, deal validation — the model only ever explains or picks among options these functions already produced.
- The three agent files (`sales.ts`, `procurement.ts`, `finance.ts`) never import each other; they only reach one another indirectly, by writing a handoff row that the orchestrator later routes.
- Sim-world stands in for the outside world (vendors, customer) and hands corrected invoices and dispute replies back to Procurement — the only place business logic crosses from "simulated" back into "our agents".
- `documents/*` is Finance/Procurement's shared path to PDFs: Procurement generates vendor invoices, Finance extracts fields from them via the vision model.

**Sources:** `web/src/lib/contracts/*.ts`, `web/src/lib/agent/*.ts`, `web/src/lib/agent/agents/*.ts`, `web/src/lib/sim/*.ts`, `web/src/lib/documents/*.ts`, `web/worker/*.ts`.
