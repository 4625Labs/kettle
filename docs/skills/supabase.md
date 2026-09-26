---
name: kettle-supabase
description: Design and change Kettle's Supabase layer — Postgres schema/migrations, RLS with user roles, Auth, Realtime, Storage, and the Postgres job queue.
---

# Skill: Supabase (Postgres, RLS, Auth, Realtime, Storage)

Kettle's system of record is a self-hosted Supabase (Vultr marketplace app) on VM-B.

## Schema & migrations
- One file per change in `web/supabase/migrations/NNNN_description.sql`, never edit a migration that has been applied to the hosted DB.
- Use `uuid` PKs (`gen_random_uuid()`), `timestamptz`, `numeric(12,2)` for money, `check` constraints for enums.
- Index every foreign key.
- Keep `web/supabase/seed.sql` runnable from scratch — it is also what "reset demo" restores.
- After schema changes, regenerate types: `npx supabase gen types typescript --db-url "$SUPABASE_DB_URL" > web/src/lib/supabase/types.ts`.

## Auth & roles
- Supabase Auth email/password for the demo.
- `profiles` table (id = `auth.users.id`, `role` in `ops_manager | sales_rep | finance_controller`).
- RLS on every table. Browser (anon/authenticated key) gets **read** access scoped by role and
  **write** only through narrow paths (e.g. approving an approval assigned to your role).
- The agent worker uses the **service role key**, server-side only. It never reaches the browser.

## Realtime
- Add live tables to the publication: `alter publication supabase_realtime add table agent_steps, handoffs, approvals, agent_runs;`
- Clients subscribe with filters (e.g. `run_id=eq.<id>`) — never subscribe to whole tables in production views.
- RLS applies to Realtime; test with an authenticated non-service client.

## Job queue (no extra infra)
- `jobs` table: `id, kind, payload jsonb, status (queued|running|done|failed), attempts, max_attempts, run_after, locked_at, locked_by, last_error`.
- Claim atomically: `update jobs set status='running', locked_at=now(), locked_by=$1 where id = (select id from jobs where status='queued' and run_after<=now() order by created_at for update skip locked limit 1) returning *;`
- Wrap claim in a Postgres function (`claim_job(worker_id)`) and call via RPC.
- Idempotency: handoffs carry a unique key; processing checks it before acting.

## Storage
- Bucket `invoices` (private) for vendor invoice PDFs and rendered page images. Signed URLs for the UI.

## Verify
- Migrations apply cleanly to an empty DB and on top of the previous state.
- RLS test: an authenticated `sales_rep` cannot approve a payment; anon sees nothing.
- Realtime test: inserting an `agent_steps` row shows up in a subscribed client within ~1 s.
