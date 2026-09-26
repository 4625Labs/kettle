You are the **Data agent** for Kettle, a hackathon project (Vultr Agent Arena, deadline Sun
2026-09-27 12:00 PM PT). Read `docs/agents/_ground-rules.md` first — it is binding.

Then read: `docs/REQUIREMENTS.md` (all of §7, §9), `docs/skills/supabase.md`, and the existing
`web/supabase/migrations/0001_init.sql` and `web/supabase/seed.sql`.

## Your goal
Deliver the **schema v2 + shared contracts** every other agent builds on. You are on the critical
path — ship a first usable version fast, then refine.

## You own
`web/supabase/**`, `web/src/lib/supabase/types.ts`, `web/src/lib/contracts/**`.

## Tasks
1. Migration `0002_agents_handoffs_auth.sql`:
   - `agent` column (`sales|procurement|finance|orchestrator`) on `agent_runs`, `agent_steps`; add
     `rationale text, model text, latency_ms int, tokens_in int, tokens_out int` to `agent_steps`.
   - `handoffs` (K1): id, run_id, from_agent, to_agent, type, payload jsonb, status
     (`pending|processing|done|failed|rejected`), idempotency_key unique, related ids, created_at, processed_at.
   - `approvals` (K4): id, run_id, subject_type, subject_id, requested_by_agent, required_role,
     reason, amount, status (`pending|approved|rejected`), decided_by, decided_at, note.
   - `jobs` + `claim_job(worker_id)` (see skill), `profiles` (role), `products`, `deal_line_items`,
     `goods_receipts`, `vendor_personas` (vendor_id, persona prompt, price band min/max per product,
     reliability, tone), `policies` (key/value: po_approval_threshold, match_tolerance_pct, max_steps).
   - Invoices: add `vendor_id`, `unit_price`, `quantity`, `file_path`, `extracted jsonb`,
     `extraction_confidence numeric`.
2. RLS by role (replace the demo "allow all" policies); service role for the worker.
3. Realtime publication for `agent_runs, agent_steps, handoffs, approvals`.
4. `reset_demo()` SQL function (see `docs/skills/reset-demo.md`).
5. Seed: 1 customer, 3 vendors with distinct personas (cheap-but-slow, premium-fast, balanced), 1
   product ("Business laptop"), the demo deal (200 × $240, needed-by Nov 15), policies, and 3 demo
   users — one per role (document credentials in `web/supabase/README.md`, dev-only passwords).
6. `web/src/lib/contracts/`: zod schemas + TS types for enums, every handoff type and payload,
   job kinds and payloads, approval subjects. Handoff types:
   `purchase_request.create` (sales→procurement), `customer_invoice.create` (sales→finance),
   `vendor_invoice.expect` (procurement→finance), `invoice.anomaly` (finance→procurement),
   `invoice.corrected` (procurement→finance), `payment.status` (finance→sales),
   `receivable.overdue` (finance→sales). Include the allow-list table (which agent may emit which).
   Job kinds: `run.start`, `handoff.process`, `vendor.rfq`, `vendor.dispute`, `vendor.invoice`,
   `customer.payment`, `approval.decided`.
7. Local Supabase (`npx supabase start`, Docker is installed) so migrations + seed are tested.
   Generate `types.ts`.

## Done when
`npx supabase db reset` applies 0001 + 0002 + seed cleanly; RLS checks from the skill pass;
contracts compile; hand-off summary lists every table/type other agents should use.
