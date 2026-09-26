# Kettle — Supabase schema v2

Local dev, schema layout, and the shared contracts every agent (Sales, Procurement, Finance,
Orchestrator, Frontend) builds on. See `docs/REQUIREMENTS.md` for the full spec and
`docs/skills/supabase.md` for the ongoing conventions.

## Run it locally

```sh
cd web
npx supabase start        # first time: pulls images, starts Postgres/Auth/Realtime/Storage
npx supabase db reset      # applies migrations/*.sql in order, then seed.sql
npx supabase gen types typescript --local > src/lib/supabase/types.ts && npx oxfmt src/lib/supabase/types.ts
```

`npx supabase status` prints the local API URL, anon key, and service-role key for `.env.local`.

## Demo users

**Local:** `seed.sql` inserts the 3 accounts directly into `auth.users` with a hardcoded
dev-only password. **Never reuse this against a hosted deployment** — it'll be sitting in a
public repo.

| Email | Password | Role |
|---|---|---|
| `ops@kettle.demo` | `kettle-demo` | `ops_manager` |
| `sales@kettle.demo` | `kettle-demo` | `sales_rep` |
| `finance@kettle.demo` | `kettle-demo` | `finance_controller` |

**Hosted (Vultr VM-B):** run `create-demo-users.sql` instead, with real passwords from env vars
(never committed). It's idempotent — safe to re-run to rotate passwords before a demo/judging
session:

```sh
KETTLE_OPS_PASSWORD=... KETTLE_SALES_PASSWORD=... KETTLE_FINANCE_PASSWORD=... \
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f web/supabase/create-demo-users.sql
```

It upserts `auth.users`/`auth.identities`/`profiles` for the same 3 fixed ids seed.sql uses, so it
works whether or not `seed.sql` already ran on that DB. Infra runs this on VM-B as part of
provisioning — the three `KETTLE_*_PASSWORD` values live in its env, not in this repo.

## Tables (0001 + 0002 + 0003)

**Ledger (0001):** `companies` (kind: customer/vendor/both), `contacts`, `deals`, `purchase_requests`,
`vendor_quotes`, `purchase_orders`, `invoices` (direction: payable/receivable), `payments`.

**Agent trail (0001 + 0002):** `agent_runs` / `agent_steps`, now with `agent`
(`sales|procurement|finance|orchestrator`) on both, and `rationale, model, latency_ms, tokens_in,
tokens_out` on `agent_steps`.

**Coordination (0002):**
- `handoffs` — K1. `from_agent`/`to_agent`, `type` (see contracts below), `payload jsonb`, `status`
  (`pending|processing|done|failed|rejected`), unique `idempotency_key`, nullable `deal_id` /
  `purchase_request_id` / `purchase_order_id` / `invoice_id` for whichever entity the handoff is about.
- `approvals` — K4. `subject_type` (`purchase_order|payment|invoice_correction`) + `subject_id`,
  `required_role`, `status` (`pending|approved|rejected`), `decided_by` → `profiles`.
- `jobs` + `claim_job(worker_id)` — the job queue. Claim atomically via
  `select * from claim_job('my-worker-id');` (wraps the skip-locked update from
  `docs/skills/supabase.md`).

**Simulated world (0002):** `products`, `deal_line_items` (deal × product × qty × unit_price),
`vendor_personas` (one row per vendor company; `price_bands` is `{ "<product_id>": {"min","max"} }`
so one row covers every product a vendor quotes), `goods_receipts`.

**Config:** `policies` (`key text primary key, value jsonb`) — seeded with
`po_approval_threshold` (`{"amount": 10000}`), `match_tolerance_pct` (`{"percent": 5}`),
`max_steps` (`{"count": 20}`). Read these at runtime; don't hardcode thresholds.

**Invoices gained:** `vendor_id`, `unit_price`, `quantity`, `file_path` (path into the `invoices`
storage bucket), `extracted jsonb` (F6 vision-extraction output), `extraction_confidence numeric`.

**Auth:** `profiles(id = auth.users.id, role)`. Role is one of `ops_manager | sales_rep |
finance_controller` — distinct from the `agent` enum, which names which AI agent acted.

## RLS

- Anon: nothing. Any signed-in user (`authenticated`): read access to every ledger, world, and
  trail table (needed for U1–U4 live views).
- Writes to ledger/world/trail tables (`deals` excepted) are service-role only — the agent worker
  is the only writer. `deals` insert/update is also allowed for `sales_rep` and `ops_manager` (S1).
- `approvals`: any signed-in user can read (U3 inbox); only a user whose `profiles.role` matches
  the approval's `required_role`, or `ops_manager`, can move a `pending` approval to
  `approved`/`rejected` — checked in the RLS policy itself (`current_role_name()` reads
  `profiles` for `auth.uid()`), not just in application code. The `UPDATE` grant to
  `authenticated` is column-scoped (`status, decided_by, decided_at, note` only — 0003) since
  Postgres RLS gates rows, not columns; a client can't smuggle a change to `amount`,
  `required_role`, or `subject_id` into the same request. The policy's `WITH CHECK` also binds
  `decided_by = auth.uid()`, so you can't record someone else as the approver.
- `policies`: `ops_manager` can update values (K7).
- Verified locally: anon read on any table returns `[]`; a `sales_rep` PATCH on a
  `finance_controller`-required approval returns `0` rows updated; `finance_controller` PATCH on
  the same row succeeds; a PATCH that also touches `amount` is rejected outright (permission
  denied, not just ignored); a PATCH claiming a different `decided_by` is rejected by `WITH CHECK`.

## Realtime

`agent_runs, agent_steps, handoffs, approvals` are in the `supabase_realtime` publication.
Subscribe with a `run_id=eq.<id>` (or similar) filter — RLS still applies to realtime, so an
unauthenticated client gets nothing.

## Reset demo

`select reset_demo();` — security-definer, callable only when the caller's `profiles.role` is
`ops_manager`. Truncates run/ledger tables (`agent_steps, agent_runs, handoffs, approvals, jobs,
goods_receipts, payments, invoices, purchase_orders, vendor_quotes, purchase_requests`) and leaves
seed data (companies, products, policies, users/profiles) intact. It also **restores** rows that
agents mutate in place rather than insert/delete: the demo deal's `stage/value/closed_at` back to
`won`/`48000.00`/now, and each vendor persona's `reliability` back to its seeded value (ahead of
P7, which will start updating it from run history) — so a reset always yields a clean golden path,
not whatever state the last run left things in. These values mirror `seed.sql`; keep both in sync
if the demo deal or vendor personas change.
Storage bucket cleanup and killing `netbird expose` child processes are the worker's job, not this
function's — see `docs/skills/reset-demo.md`.

## Storage

`invoices` bucket (private). Use signed URLs from the server; never expose the service-role key to
the browser.

## `web/src/lib/contracts/` — shared TS/zod contracts

- `enums.ts` — `Agent`, `ProfileRole`, `HandoffStatus`, `HandoffType`, `ApprovalStatus`,
  `ApprovalSubjectType`, `JobStatus`, `JobKind`, plus a permissive `uuidSchema`. **Use
  `uuidSchema`, not zod's `z.uuid()`**, for any id that might come from seed data — Postgres
  accepts any 8-4-4-4-12 hex string as a `uuid`, but zod's `z.uuid()` also validates RFC version
  bits and rejects the readable fake ids seed.sql uses (e.g. `10000000-0000-0000-0000-000000000001`).
- `handoffs.ts` — a zod payload schema per handoff type, `HANDOFF_PAYLOAD_SCHEMAS` (type →
  schema), `HANDOFF_ALLOW_LIST` (type → `{from, to}`, the K2 allow-list), `isAllowedHandoff()`,
  `parseHandoffPayload(type, payload)`, and `handoffInsertSchema` (validates payload shape *and*
  the allow-list together — use this before inserting into `handoffs`).
- `approvals.ts` — `approvalInsertSchema`, `approvalDecisionSchema` (what the UI sends on
  approve/reject), `APPROVAL_SUBJECT_TABLES` (subject_type → table name, for joins).
- `jobs.ts` — a zod payload schema per job kind, `JOB_PAYLOAD_SCHEMAS`, `parseJobPayload(kind,
  payload)`, `jobInsertSchema`.

### Handoff types (allow-list)

| Type | From → To | Payload |
|---|---|---|
| `purchase_request.create` | sales → procurement | `deal_id, product_id, description, quantity, needed_by, target_unit_cost` |
| `customer_invoice.create` | sales → finance | `deal_id, customer_id, amount, due_date` |
| `vendor_invoice.expect` | procurement → finance | `purchase_order_id, vendor_id, expected_unit_price, expected_quantity, expected_amount` |
| `invoice.anomaly` | finance → procurement | `invoice_id, purchase_order_id, reason, expected_unit_price, actual_unit_price, expected_quantity, actual_quantity` |
| `invoice.corrected` | procurement → finance | `invoice_id, purchase_order_id, corrected_unit_price, corrected_quantity, note?` |
| `payment.status` | finance → sales | `deal_id, invoice_id, status, amount, paid_at?` |
| `receivable.overdue` | finance → sales | `deal_id, invoice_id, days_overdue, amount` |

The orchestrator (K2) must reject any handoff whose `(type, from_agent, to_agent)` isn't in
`HANDOFF_ALLOW_LIST` — `handoffInsertSchema` enforces this at construction time too.

### Job kinds

`run.start, handoff.process, vendor.rfq, vendor.dispute, vendor.invoice, customer.payment,
approval.decided` — see `jobs.ts` for each payload shape.

## New dependency

Added `zod` (`^4.6.5`) to `web/package.json` for the contracts package.

## Known gaps / what's next

- `products`/`vendor_personas.price_bands` cover only the seeded "Business laptop" — fine for the
  single-product demo scope, revisit if a second product is added.
- No TS helper wraps `claim_job`/RPC calls yet — that's worker code (agents-core's lane).
- Approval `subject_type` list (`purchase_order | payment | invoice_correction`) matches P4/F4/P5;
  extend both the DB check constraint (0002) and `APPROVAL_SUBJECT_TYPES` together if another
  gate shows up.
