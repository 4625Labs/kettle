# Kettle — Requirements & Scope

> *A kettle is a flock of vultures circling together.* Kettle is a flock of AI agents —
> Sales, Procurement, and Finance — that run an enterprise's back office together on Vultr.

Status: **DRAFT for review** · Event: Vultr Agent Arena (Challenge 2 — Future of Work)
Deadline: **Sun 2026-09-27, 12:00 PM PT** (submissions) · Judging same day

---

## 1. Problem

In mid-size companies, one customer order touches three teams that don't share a system:

- **Sales** closes the deal in a CRM, then emails ops "we need 200 units by Nov 15."
- **Procurement** re-keys that into a spreadsheet, emails three vendors for quotes, picks one, issues a PO.
- **Finance** receives the vendor invoice weeks later, hunts for the matching PO, discovers the
  price doesn't match, emails procurement, and separately chases the customer for payment.

Every handoff is manual, slow, and lossy. Mismatched invoices get paid, customer invoices go out
late, and nobody can see where a given order is stuck.

## 2. Solution in one line

Three specialized agents share **one ledger** and hand work to each other through explicit,
auditable **handoffs** — so a won deal flows to a paid vendor and a collected customer invoice
with humans only approving what matters.

## 3. Goals & non-goals

### Goals
- G1. Show a real, multi-step, **multi-agent** workflow across sales → procurement → finance.
- G2. Every agent action is **actually executed** against the ledger and **visible live** in an
  execution trail (not a described plan, not a static dashboard).
- G3. Agents **coordinate**: hand off work, push back on each other (e.g. invoice mismatch), and
  escalate to a human when rules say so.
- G4. Runs entirely on **Vultr** (VM backend, Vultr-hosted Supabase, Vultr Serverless Inference)
  and is reachable at a **public URL**.
- G5. A crisp **3-minute live demo** with one clear "wow" moment.

### Non-goals (explicitly out of scope)
- Real integrations with Salesforce, SAP, QuickBooks, email providers, or payment rails.
  External parties (customers, vendors) are **simulated**.
- Moving real money. "Payments" are ledger records with a status.
- Multi-tenant SaaS, billing, org management.
- Tax, multi-currency FX, accounting standards compliance.
- Mobile app.

## 4. Hackathon constraints (hard requirements)

| # | Constraint | Source |
|---|---|---|
| C1 | VM-based backend on Vultr | Challenge 2 (mandatory) |
| C2 | Vultr is the system of record & control, not static hosting | Challenge 2 |
| C3 | Public web URL, product-style UX, clear user flows | Challenge 2 |
| C4 | Public GitHub repo with setup + docs | Rules (push only when we decide) |
| C5 | ~1-minute recorded demo video | Submission |
| C6 | Only work built during the event; clearly identifiable | Rules |
| C7 | Must NOT be a "dashboard as the main feature" project | Banned list |
| C8 | No Vultr GPUs; LLM via Vultr Serverless Inference | Challenge 2 note |

Judging: Technicality 40% · Creativity 25% · Live demo 20% · Future potential 15%.
Bonus: serve via NetBird reverse proxy with zero open inbound ports.

## 5. Users

| Persona | What they do in Kettle |
|---|---|
| **Ops Manager** (primary demo user) | Kicks off / watches workflows, approves gated actions, resolves escalations |
| **Sales Rep** | Creates a deal, sees fulfillment + payment status without asking anyone |
| **Finance Controller** | Reviews flagged invoices, approves payments |

For the hackathon a single logged-in user can switch between these roles.

## 6. Core scenario (the golden path)

1. **Sales Agent** — A deal "Acme Retail: 200 laptops, $48,000, needed by Nov 15" is marked
   *won*. Sales Agent validates it (customer, qty, price, margin), then emits two handoffs:
   - → Procurement: *purchase request* (item, qty, needed-by, target cost).
   - → Finance: *create customer invoice* (receivable).
2. **Procurement Agent** — Requests quotes from 3 simulated vendors, receives responses, scores
   them (price, lead time vs needed-by, vendor reliability), writes its reasoning, selects one.
   PO above the approval threshold → **human approval gate**. On approval, issues the PO and
   hands off → Finance: *expect vendor invoice for PO-xxxx*.
3. **Finance Agent** — Issues the customer invoice. When the vendor invoice arrives, performs a
   **3-way match** (PO ↔ invoice ↔ goods receipt). Match → schedules payment (approval gate).
4. **The twist (demo "wow" moment)** — the vendor invoice comes in at **$212/unit instead of the
   quoted $195**. Finance flags the anomaly and hands it **back** to Procurement. Procurement
   checks the original quote, drafts a dispute message to the vendor, the simulated vendor issues
   a corrected invoice, Finance re-matches and clears it. All three lanes light up in the trail.
5. **Closing the loop** — Customer pays (or goes overdue → Finance drafts a follow-up and notifies
   Sales Agent, which updates the deal/account health). Deal shows *fulfilled & collected*.

## 7. Functional requirements

Priority: **P0** = must ship for demo · **P1** = should ship · **P2** = stretch.

### 7.1 Sales Agent
| ID | Requirement | P |
|---|---|---|
| S1 | Create/edit deals (customer, line items, value, needed-by, stage) via UI | P0 |
| S2 | On `won`: validate deal (required fields, margin vs target cost) and log reasoning | P0 |
| S3 | Emit handoffs: purchase request → Procurement, customer invoice → Finance | P0 |
| S4 | Receive status updates (PO issued, invoice paid/overdue) and reflect on the deal | P1 |
| S5 | Lead qualification: score an inbound lead and draft outreach | P2 |

### 7.2 Procurement Agent
| ID | Requirement | P |
|---|---|---|
| P1 | Consume purchase-request handoff; create purchase request record | P0 |
| P2 | Send RFQs to ≥3 simulated vendors; collect quotes (price, lead time) | P0 |
| P3 | Score & select vendor with written rationale (LLM + deterministic scoring) | P0 |
| P4 | Issue PO; PO above threshold requires human approval | P0 |
| P5 | Handle Finance pushback on invoice mismatch: compare to quote, draft dispute, request correction | P0 |
| P6 | Track delivery / goods receipt (simulated) | P1 |
| P7 | Vendor reliability score updated from history (late, disputed) | P2 |

### 7.3 Finance Agent
| ID | Requirement | P |
|---|---|---|
| F1 | Issue customer (receivable) invoice from Sales handoff | P0 |
| F2 | Ingest vendor (payable) invoice; match to PO (amount, qty, unit price, vendor) | P0 |
| F3 | Flag anomalies (price/qty mismatch, duplicate invoice, unknown PO) and hand back to Procurement | P0 |
| F4 | Schedule payment for matched invoices; payments require human approval | P0 |
| F5 | Detect overdue receivables; draft customer follow-up; notify Sales | P1 |
| F6 | Extract invoice fields from an uploaded PDF/image via a Vultr vision model (PDF page rendered to image); low-confidence fields go to human review | P0 |
| F7 | Cash position summary (receivables vs payables) | P2 |

### 7.4 Coordination (the "kettle")
| ID | Requirement | P |
|---|---|---|
| K1 | Handoffs are first-class records: from, to, type, payload, status, timestamps | P0 |
| K2 | An **AI orchestrator** routes handoffs to the right agent and runs it; agents never call each other directly. Its choices are constrained to an allow-list of (agent, action) pairs and schema-validated | P0 |
| K3 | Every agent step is logged (agent, action, input, output, status, reasoning) | P0 |
| K4 | Human approval queue: approve / reject with note; agent resumes on decision | P0 |
| K5 | Idempotent processing: a handoff is processed at most once; failures retry with limit | P1 |
| K6 | Escalation to human when an agent can't resolve after N attempts | P1 |
| K7 | Configurable policies (approval thresholds, match tolerance %) in UI | P2 |

### 7.5 Simulated world
| ID | Requirement | P |
|---|---|---|
| W1 | Seeded customers, vendors, products, prices | P0 |
| W2 | **AI-played vendor personas** respond to RFQs and disputes; prices bounded per persona and schema-validated; vendor text treated as untrusted input by our agents | P0 |
| W3 | "Inject anomaly" control instructs a vendor persona to overbill, so the demo twist fires every time | P0 |
| W5 | Vendor personas generate their invoices as PDFs (feeds F6) | P0 |
| W4 | Customer simulator pays on time / late | P1 |

### 7.6 Web application
| ID | Requirement | P |
|---|---|---|
| U1 | **Live workflow view**: three agent lanes + handoff arrows, updating in real time | P0 |
| U2 | Deal detail page: full lifecycle (deal → PR → quotes → PO → invoices → payments) | P0 |
| U3 | Approvals inbox | P0 |
| U4 | Step inspector: click a step to see input, output, and agent reasoning | P0 |
| U5 | Auth (Supabase) with roles: ops manager, sales rep, finance controller — role decides what you can approve | P0 |
| U6 | Landing page explaining Kettle | P1 |

### 7.7 Zero-port access (NetBird bonus)
| ID | Requirement | P |
|---|---|---|
| N1 | App VM has **zero inbound ports**; Kettle is served only through a NetBird reverse-proxy service | P0 |
| N2 | Public service gated by NetBird SSO/password in front of Supabase login (real user roles) | P0 |
| N3 | Supabase API (auth, realtime) also reached only via NetBird, never a public port | P0 |
| N4 | **Lifecycle-bound URLs**: each workflow run gets an ephemeral, PIN-protected URL (`netbird expose`) that dies when the run completes | P1 |

## 8. Non-functional requirements

| Area | Requirement |
|---|---|
| Hosting | App + agent worker on a Vultr VM; Supabase on Vultr (marketplace app) |
| Inference | All LLM calls via Vultr Serverless Inference (OpenAI-compatible) |
| Reliability | Golden path must complete end-to-end in < 60 s; demo must survive an LLM failure (deterministic fallback for scoring/matching) |
| Real-time | UI reflects new steps within ~1 s (Supabase Realtime) |
| Security | Secrets only in server env; service-role key never sent to browser; LLM output never executed as code; money-moving actions always gated |
| Auditability | Full step + handoff history is immutable and replayable |
| Reset | One-click "reset demo" restores seed state |
| Docs | README: architecture diagram, setup, deploy, demo script |

## 9. Data model (logical)

Existing: `companies`, `contacts`, `deals`, `purchase_requests`, `vendor_quotes`,
`purchase_orders`, `invoices`, `payments`, `agent_runs`, `agent_steps`.

To add:
- `agent_steps.agent` / `agent_runs.agent` — `sales | procurement | finance | orchestrator`
- `handoffs` — id, from_agent, to_agent, type, payload (jsonb), status, related ids, created/processed_at
- `approvals` — id, subject type/id, requested_by_agent, reason, status, decided_by, note
- `products` / `deal_line_items` — so quantities and unit prices are matchable
- `goods_receipts` — for the 3-way match (P1)
- `policies` — thresholds / tolerances (P2)

## 10. Success criteria (mapped to judging)

| Criterion | How Kettle wins it |
|---|---|
| Technicality (40%) | Real multi-agent orchestration with handoffs, approval gates, retries, 3-way match, LLM + deterministic hybrid, realtime UI, all on Vultr |
| Creativity (25%) | Agents that **push back on each other**, not a linear pipeline; the "kettle" metaphor |
| Live demo (20%) | One button → watch three lanes work → anomaly caught → resolved, in < 3 min |
| Future potential (15%) | A pattern for agent-to-agent enterprise ops: auditable, policy-gated autonomy |

## 11. Scope tiers

- **MVP (must have by Sun ~8 AM):** S1–S3, P1–P5, F1–F4, F6, K1–K4, W1–W3, W5, U1–U5, N1–N3, deployed on Vultr behind NetBird.
- **Polish (Sun 8–11 AM):** K5, K6, F5, N4, U6, README diagram, demo video.
- **Stretch:** S5, P7, K7, F7, W4.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LLM latency/flakiness wrecks live demo | Deterministic core logic; LLM for reasoning text and extraction; timeouts + fallback |
| Scope too big (3 agents) | Strict P0 list; each agent's P0 is 3–5 steps; stretch only after deploy |
| Looks like "a dashboard" | Lead the demo with agents acting and arguing, not charts |
| Vultr setup eats time | Provision VM + Supabase first, deploy a hello-world early, then deploy continuously |
| Model quality on Vultr inference | Pick model from live list early; test tool-calling/JSON output first |

## 13. Decisions (2026-09-26)

1. **Orchestrator:** AI-driven, constrained by allow-list + schema validation + step cap + loop detection.
2. **Vendor simulator:** AI-played personas, bounded prices, deterministic anomaly injection.
3. **Invoice input:** PDF → image → Vultr vision model extraction, promoted to P0 (F6).
4. **Auth:** required for the demo, with roles (U5 → P0).
5. **NetBird bonus:** attempting it (section 7.7).
6. **Team:** solo developer + Claude coding agents.

## 14. Infrastructure

| Component | Where | Exposure |
|---|---|---|
| **VM-A** Kettle app (Next.js) + agent worker (Docker Compose) + NetBird client | Vultr cloud compute | **No inbound ports** (Vultr firewall denies all) |
| **VM-B** Supabase marketplace app (Postgres, Auth, Realtime, Storage) | Vultr cloud compute | Vultr VPC to VM-A; browser access via NetBird service only |
| **VM-C** NetBird self-hosted (Vultr marketplace: Traefik, reverse proxy, CrowdSec), shared CPU ≥ 2 GB | Vultr cloud compute | The only public box: 443/80 + NetBird relay ports |
| Vultr Serverless Inference | Managed | API key in server env only |

Needs a **domain we control**: `A netbird.<domain>` → VM-C, `CNAME *.netbird.<domain>` → `netbird.<domain>`
(DNS-only, not Cloudflare-proxied). NetBird reverse proxy is **beta**; `netbird expose` sessions are
ephemeral (90 s TTL, renewed every 30 s) with a limit of 10 per peer, and require "Peer Expose" to be
enabled in account settings.

### Runtime models (Vultr Serverless Inference, from the live list — to benchmark once we have a key)

| Role | Candidates | Why |
|---|---|---|
| Orchestrator + 3 business agents | `glm-5.3`, `deepseek-v4.1-flash` | Tool calling + reasoning, 1M context |
| Vendor/customer personas | `qwen3.8-flash-next`, `laguna-s-2.1` | Cheapest/fastest; persona text only |
| Invoice extraction (vision) | `glm-5.3-flash`, `qwen3.8-27b` | Image input + tools |
| Untrusted-text screening (optional) | `nemotron-3.5-content-safety` | Screen vendor messages before agents read them |

At listed prices, a full golden-path run (~40 calls) costs well under $0.10.

## 15. Open items

1. **Domain** for NetBird DNS — which domain/registrar?
2. **Vultr Serverless Inference API key** → `web/.env.local` (never in chat or git) to benchmark models.
3. **Vultr API key** for the infra agent (or you create VMs in the console yourself).
