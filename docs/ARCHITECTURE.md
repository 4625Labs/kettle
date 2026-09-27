# Kettle: Architecture & Design

This document explains how Kettle's agents coordinate, make decisions, and maintain an auditable ledger of all actions.

**For system diagrams, see** [`docs/diagrams/`](diagrams/) **— 10 Mermaid diagrams covering context, deployment, data model, and agent workflows.**

## Overview: Three Agents + One Orchestrator

```
Sales Agent          Procurement Agent          Finance Agent
  │                        │                         │
  ├─ validates deal         ├─ gets RFQs             ├─ issues invoice
  ├─ emits handoffs         ├─ scores vendors        ├─ matches PO↔invoice
  └─ updates deal status    ├─ issues PO             ├─ flags anomalies
                            ├─ disputes invoices     └─ schedules payments
                            └─ handles corrections

                    ↓  (all events route through)  ↓
                    
                    AI Orchestrator (K2)
                    ├─ routes events to agents
                    ├─ validates routes vs allow-list
                    ├─ records decisions & reasoning
                    ├─ enforces step caps
                    └─ escalates on loop/failure
                    
                    ↓  (all state lives in)  ↓
                    
            Shared Ledger (Postgres)
            ├─ agent_runs (one execution trail per workflow)
            ├─ agent_steps (all decisions: input, output, rationale)
            ├─ handoffs (first-class records: from→to, type, payload)
            ├─ approvals (human decision records)
            └─ jobs (the queue: work to be done)
```

## Agent Roles

### Sales Agent
**Responsibility:** Validate deals, coordinate customer billing, track payment status.

**Actions:**
- `validate_won_deal` — When a deal is marked "won", verify required fields (customer, qty, price, margin). Emit handoffs:
  - `purchase_request.create` → Procurement
  - `customer_invoice.create` → Finance
  - Record rationale (e.g., "Deal $50k, customer ABC, 200 units, needed by 2026-11-15, margin 18%").

- `record_payment_status` — When Finance flags a payment, update the deal's status (e.g., "collected").

- `handle_overdue` — When a customer invoice is overdue, flag the deal and draft a follow-up message.

**Guardrails:**
- Deals must have a customer_id, quantity, unit_price, and needed_by date.
- Margin check: (unit_price - target_cost) / unit_price ≥ minimum margin (e.g., 15%).

**Examples:**
- ✅ Deal "Acme: 200 laptops, $48k, needed Nov 15" → validates ✓, emits PR + invoice.
- ❌ Deal "Acme: 200 laptops, no price" → rejected, handoffs blocked.

### Procurement Agent
**Responsibility:** Source products, manage vendor selection, handle invoice disputes.

**Actions:**
- `handle_purchase_request` — Receive a purchase request from Sales. Send RFQs to ≥3 vendors (simulated personas). Record responses (price, lead time, vendor message).

- `score_vendors` — Score each quote on price (50%), lead time vs needed-by (20%), and vendor reliability (30%). Pick the best. Record scoring logic.

- `issue_po` — Create a purchase order. If amount ≥ threshold (e.g., $10k), request approval from ops_manager (K4). On approval, emit handoff to Finance: `vendor_invoice.expect`.

- `handle_invoice_anomaly` — Receive an invoice mismatch from Finance. Compare the invoice to the original quote. If price/qty don't match, draft a dispute message and ask the vendor (simulated) to correct it.

- `review_corrected_invoice` — When the vendor sends a corrected invoice, validate it and hand back to Finance: `invoice.corrected`.

**Guardrails:**
- RFQ responses are simulated deterministically per vendor persona (seeded by purchase request +
  vendor id), not fetched live — there's no vendor timeout or fallback price to reason about.
- Approval gate: PO ≥ $10k blocks until ops_manager approves.
- Dispute tolerance: flag if actual invoice ≥ 5% over quoted.

**Examples:**
- ✅ PR "200 units, needed Nov 15, target $195/unit" → RFQs to Northwind ($190), Fabrikam ($198), Contoso ($205) → picks Northwind, issues PO, hands off to Finance.
- ❌ Vendor invoice arrives at $212/unit → 9% over quote → flagged as anomaly → Procurement disputes → vendor corrects.

### Finance Agent
**Responsibility:** Bill customers, match vendor invoices, schedule payments.

**Actions:**
- `issue_customer_invoice` — Receive a customer invoice request from Sales. Create a receivable. Record the invoice amount and due date.

- `expect_vendor_invoice` — Receive a note from Procurement that a vendor invoice will arrive for a specific PO. Store the expected amount, qty, unit price.

- `ingest_vendor_invoice` — A vendor invoice PDF arrives. Extract fields using a vision LLM (glm-5.3-flash). Record extracted values (vendor, date, amount, line items) and confidence scores. Perform a **3-way match**:
  - PO amount ≈ invoice amount (within tolerance, e.g., ±5%)?
  - PO quantity ≈ invoice quantity?
  - Vendor matches?
  - If any mismatch → flag and hand back to Procurement: `invoice.anomaly`.

- `rematch_invoice` — After Procurement's correction, re-extract and re-match the corrected invoice. Record the new match result.

- `schedule_payment` — If 3-way match passes, request approval from finance_controller (K4). On approval, mark the invoice as "paid" (or schedule for real payment in a real system).

**Guardrails:**
- Match tolerance: 5% for amounts, exact for quantities (qty must match PO exactly).
- Low confidence on extraction (< 0.7): promote to human review.
- Every payment requires approval; no auto-payment.

**Examples:**
- ✅ Invoice "200 units @ $190 = $38k" matches PO "200 @ $195 = $39k" (within 5%) → passes → requests payment approval.
- ❌ Invoice "200 units @ $212 = $42.4k" doesn't match PO (9% over) → flagged → back to Procurement.

### Orchestrator (AI-Driven, Allow-List Enforced) — K2
**Responsibility:** Route events to the right agent; validate routes; prevent agent loops and invalid states.

**Mechanism:**
1. An event arrives (e.g., `deal.won`, `invoice.anomaly`, `approval.decided`).
2. The orchestrator calls an LLM with the event context and asks: "Which agent action should handle this?"
3. The LLM returns a route (e.g., `sales.validate_won_deal`).
4. Code **validates** the route against a static allow-list (HANDOFF_ALLOW_LIST + ROUTES).
5. If valid: agent executes, step status `ok`. If invalid or off-list: **forced route** (the
   allow-listed route for that event) + step status `flagged` — this is logged for audit, but does
   not stop the run or count as an escalation (see K6 below).
6. Step is recorded with input, output, LLM model, latency, tokens, and reasoning.

**Allow-List (excerpt):**
```
deal.won → sales.validate_won_deal
purchase_request.create → procurement.handle_purchase_request
vendor_invoice.expect → finance.expect_vendor_invoice
invoice.anomaly → procurement.handle_invoice_anomaly
invoice.corrected → finance.rematch_invoice
approval.decided → [resume corresponding agent]
```

**Guardrails on Orchestrator:**
- **Step cap:** Max N routing decisions per run (e.g., 20). If exceeded → escalate to human.
- **Loop detection:** If the same agent-action pair is routed 3+ times for the same event → escalate.
- **Invalid route:** If the LLM suggests an off-list route (e.g., finance trying to issue a PO) →
  flag the step (`status: 'flagged'`, rationale explains the override) and force the one allow-listed
  route for that event. The run is not stopped or marked failed — only step-cap and loop-detection
  do that (K6).
- **Timeout:** The orchestrator's own routing call times out at 15s; other agents' LLM calls use a
  20s timeout. Either way, on timeout or any model failure, the call returns its deterministic
  fallback value instead (for routing: the allow-listed route itself) — the run keeps going.

**Why AI instead of a state machine?**
- Agents can communicate flexibly. If the orchestrator learns (e.g., from examples) that a new handoff type should exist, the routes can adapt without code changes.
- Reasoning is transparent: every routing decision is logged with the LLM's rationale, so auditors can see *why* Procurement was chosen for a given event.

## Handoffs: First-Class Records

A **handoff** is how agents communicate. It is not a function call; it is a record.

```sql
CREATE TABLE handoffs (
  id UUID PRIMARY KEY,
  run_id UUID,                  -- which workflow
  from_agent agent_type,        -- e.g., 'sales'
  to_agent agent_type,          -- e.g., 'procurement'
  type handoff_type,            -- e.g., 'purchase_request.create'
  payload JSONB,                -- validated against schema for that type
  status handoff_status,        -- 'pending' → 'processing' → 'done' or 'failed'
  created_at timestamptz,
  processed_at timestamptz,
  error_message TEXT            -- if failed
);
```

**Why records, not function calls?**
- **Idempotency (K5):** A handoff can be replayed. If the worker crashes mid-processing, it retries the same handoff with the same ID; the agent detects it's already been seen and returns the same result.
- **Audit trail:** Every inter-agent communication is logged, versioned, and immutable.
- **Policy enforcement:** Before a handoff is processed, guardrails check it (e.g., "Does this payment amount exceed company policy?").
- **Debugging:** If something goes wrong, the full handoff record (payload, error) is available.

**Example Handoffs:**

1. **purchase_request.create** (sales → procurement)
   ```json
   {
     "deal_id": "...",
     "product_id": "...",
     "description": "Laptops, 14-inch",
     "quantity": 200,
     "needed_by": "2026-11-15",
     "target_unit_cost": 195.00
   }
   ```

2. **vendor_invoice.expect** (procurement → finance)
   ```json
   {
     "purchase_order_id": "...",
     "vendor_id": "...",
     "expected_unit_price": 190.00,
     "expected_quantity": 200,
     "expected_amount": 38000.00
   }
   ```

3. **invoice.anomaly** (finance → procurement)
   ```json
   {
     "invoice_id": "...",
     "purchase_order_id": "...",
     "reason": "unit price mismatch: quoted $190, invoice $212 (+11.6%)",
     "expected_unit_price": 190.00,
     "actual_unit_price": 212.00,
     "tolerance_percent": 5.0
   }
   ```

## Job Queue & Execution Loop

Postgres is the queue (no external message broker). The worker is a simple poll loop:

```
loop {
  claim_job(worker_id, limit=4)  // RPC call; claims up to 4 jobs atomically
  for each claimed job {
    dispatch(job_kind, job_input)
    update job status to 'done' or 'failed'
  }
  sleep(300ms)
}
```

**Job types:**
- `run.start` — New workflow started; initialize and emit first event.
- `handoff.process` — Process a handoff (route to agent, execute agent, record step).
- `vendor.rfq` — Send RFQ to a vendor persona; get back quote + message.
- `vendor.dispute` — Send dispute to vendor; get back correction + response.
- `vendor.invoice` — Vendor sends an invoice PDF; extract and match.
- `customer.payment` — Customer pays or goes overdue.
- `approval.decided` — Human approved/rejected an approval request; resume agent.
- `customer.paid` — Customer invoice marked paid; update deal.

**Worker isolation:**
- Worker is stateless (all state in Postgres).
- Multiple workers can run in parallel safely (claim_job uses Postgres's row locking).
- Worker crash/restart doesn't lose work (jobs remain in queue).

## Approval Gates: Async Human Decisions

When an agent wants a human to approve something (e.g., a $15k PO), it calls:

```typescript
await requestApproval({
  subject_type: "purchase_order",
  subject_id: po_id,
  requested_by_agent: "procurement",
  reason: "PO amount $15k exceeds $10k threshold",
  role_required: "ops_manager"  // only this role can approve
});
```

This creates an `approvals` record with status='pending'. The UI polls/subscribes to this table and shows it in the approvals inbox. When a human clicks "Approve" or "Reject", the UI updates the record. A Postgres trigger (0004) then enqueues an `approval.decided` job. The worker picks it up and resumes the original agent.

**Approval records:**
```sql
CREATE TABLE approvals (
  id UUID PRIMARY KEY,
  run_id UUID,
  subject_type approval_subject_type,  -- 'purchase_order', 'payment', etc.
  subject_id UUID,
  requested_by_agent agent_type,
  reason TEXT,
  status approval_status,  -- 'pending' → 'approved' or 'rejected'
  decided_by profile_id,   -- who approved
  decided_at timestamptz,
  note TEXT,               -- optional comment from approver
  created_at timestamptz
);
```

**Why not block the worker?**
- The worker can't afford to block (other jobs are queued).
- Humans take seconds to hours to decide; the worker can process other workflows in parallel.
- Resume is a job like any other, so the orchestrator & ledger logic apply uniformly.

## Escalation: When Humans Must Intervene — K6

An escalation happens when:

1. **Step cap exceeded:** ≥20 orchestrator routing decisions in one run (suggests a loop or policy violation).
2. **Loop detected:** The same handoff type is routed between the same two agents more than 3 times in one run.
3. **Agent failure:** Agent raises an error (e.g., "Vendor not found"). Orchestrator logs it and escalates.

An invalid/off-list route is **not** on this list — it's flagged and silently corrected to the
allow-listed route (see the Orchestrator guardrails above); the run continues normally.

When escalated:
- An `escalate` step is recorded in agent_steps.
- The run is marked `failed`.
- A human can review the ledger and decide the next step (rewind, adjust policy, retry, etc.).

**Example:**
- Run hits step cap at 20 orchestrator decisions.
- The ledger shows: sales validated deal → procurement sent RFQ → finance expects invoice → procurement disputes invoice → ... (repeating cycles).
- Operations team reviews and decides: "Policy tolerance is too strict (5%). Bump to 8%." Next run with the new policy succeeds.

## Guardrails: Data Validation & Policy Enforcement

Every input and output is validated:

**Agent outputs:**
- Handoffs are validated against their Zod schema (see `web/src/lib/contracts/handoffs.ts`).
- LLM outputs are parsed as JSON; if invalid, agent retries up to 2x, then escalates.

**Business rules (in code, not LLM):**
- Invoice match tolerance: ±5% on amount, ±0 on quantity.
- PO approval threshold: ≥$10k requires ops_manager.
- Payment approval: always requires finance_controller.
- Vendor scores: price 50%, lead time 20%, reliability 30% (hardcoded formula).

**Policy table (P2 feature, not MVP):**
```sql
CREATE TABLE policies (
  id UUID PRIMARY KEY,
  name TEXT,         -- 'default', 'strict', etc.
  po_approval_threshold DECIMAL,  -- default 10000
  match_tolerance_percent DECIMAL, -- default 5
  max_steps INT,     -- default 20
  created_at timestamptz
);
```

For MVP, policies are hardcoded. Future: make them configurable via UI.

## NetBird Zero-Port Design — N1–N4

**Goal:** Vultr App and DB VMs have zero inbound ports (firewall denies all). All traffic flows through a reverse proxy.

**Architecture:**
- **VM-A (app):** Docker containers (web + worker). Firewall: no inbound public ports. Listens only on localhost:3004, localhost:3005 (worker).
- **VM-B (db):** Supabase (Postgres, Auth, Realtime, Storage). Firewall: no inbound public ports. Listens only on localhost:5432 (Postgres), localhost:8000 (Envoy proxy for Auth/Realtime).
- **VM-C (netbird):** NetBird self-hosted (Traefik reverse proxy, management server, dashboard). Firewall: public 80, 443 (HTTPS), 51820 (NetBird UDP, not used for app traffic). Terminates TLS, proxies HTTP to VM-A and VM-B over the VPC.

**Network flow:**
```
Browser → netbird.4625labs.com (VM-C public IP, 443/TLS)
       → Traefik reverse proxy (checks Host header)
       → If Host=kettle.4625labs.com: proxy to VM-A:3004 over VPC
       → If Host=api.netbird.4625labs.com: proxy to VM-B:8000 over VPC
```

**Per-run URLs (N4):**
- Each workflow run spawns a `netbird expose` session (ephemeral, 90s TTL, renewals every 30s).
- Session generates a unique URL and PIN (e.g., `run-abc123.netbird.4625labs.com`, PIN `A1B2C3D4`).
- URL serves the read-only run page directly (no Kettle login).
- When the run completes, the `netbird expose` session terminates; URL expires.

**Benefit:** 
- No attacker can port-scan and find the app VMs (no open ports).
- All traffic is authenticated (Supabase session or NetBird PIN).
- Customers could self-host their own NetBird instance and restrict access to their org's devices.

## Data Model Highlights

**Core tables:**
- `companies`, `contacts`, `deals` — CRM domain.
- `products`, `deal_line_items` — Items on deals and invoices.
- `purchase_requests`, `purchase_orders` — Procurement domain.
- `vendor_quotes` — Vendor RFQ responses.
- `invoices` (receivables and payables via `type` column) — Finance domain.
- `payments` — Payment status records.
- `agent_runs`, `agent_steps` — Execution trail.
- `handoffs`, `approvals` — Coordination records.
- `jobs` — Work queue.
- `profiles` — User accounts + roles (ops_manager, sales_rep, finance_controller).

**Realtime subscriptions:**
```typescript
// UI subscribes to these tables per run_id:
supabase
  .channel(`run:${runId}`)
  .on("postgres_changes", {
    event: "*",
    schema: "public",
    table: "agent_steps",
    filter: `run_id=eq.${runId}`
  }, (payload) => updateUI(payload))
  .subscribe();
```

When a step is recorded (worker inserts a row), Supabase Realtime broadcasts it to all subscribed clients. UI updates <1s.

## Performance & Reliability

**Latency (golden path):**
- Sales validate: ~1s (LLM call).
- Procurement RFQ + scoring: ~3s (3 parallel vendor calls + LLM scoring).
- Finance match: ~1s (deterministic, no LLM).
- Approval wait: human-dependent, logged.
- **Total end-to-end:** ~19s (5 runs avg, deterministic fallback if LLM is slow).

**Reliability:**
- LLM fallback: any model call (route, score, extract, etc.) that errors or times out (15s for
  routing, 20s for other agent calls) returns a deterministic fallback value instead of failing the
  step.
- Vendor quotes: generated deterministically from seeded personas, not a live call — nothing to
  time out or fall back on.
- Retry: Failed jobs retry with exponential backoff (base 500ms) up to 5x.
- Stale job reaper: If a job is claimed but not updated for >5 min, it's reclaimed (prevents zombie workers).

**Known limitation:** `handoffs` has an `idempotency_key` (unique constraint + insert-time conflict
handling), so a retried handoff is safely a no-op. `vendor_quotes` doesn't have the equivalent yet —
if a `vendor.rfq` job is reclaimed and rerun after partially inserting quotes (e.g. a worker crash
mid-loop), it can insert duplicate rows for the same purchase request. Not exercised by the golden
path or the current test scenarios; fix is a unique constraint on `(purchase_request_id, vendor_id)`
plus an upsert, mirroring the `handoffs` pattern.

**Observability:**
- Agent step logs: input, output, model, latency, tokens, reasoning.
- Handoff status: pending → processing → done/failed/rejected.
- Approval audit: who decided, when, with what rationale.
- Real-time dashboard: `/run` shows all lanes live-updating.

## References

- **System context diagram:** `docs/diagrams/01-system-context.md`
- **Deployment diagram:** `docs/diagrams/02-deployment.md`
- **Technical architecture:** `docs/diagrams/04-technical-architecture.md`
- **Application architecture:** `docs/diagrams/05-application-architecture.md`
- **Data model:** `docs/diagrams/06-data-model.md`
- **Golden path scenario:** `docs/diagrams/07-golden-path.md`
- **Approval states:** `docs/diagrams/08-states-and-approvals.md`
- **Contracts & schemas:** `web/src/lib/contracts/`
- **Orchestrator:** `web/src/lib/agent/orchestrator.ts`
- **Agents:** `web/src/lib/agent/agents/{sales,procurement,finance}.ts`
- **Ledger:** `web/src/lib/agent/ledger.ts`
- **DB schema:** `web/supabase/migrations/`

---

**Questions?** See `docs/REQUIREMENTS.md` for full spec, or `docs/TEST-PLAN.md` for test scenarios.
