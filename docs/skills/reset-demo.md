---
name: kettle-reset-demo
description: Restore Kettle's database and simulated world to the known demo seed state (locally or on Vultr) and verify the golden path is ready. Use before rehearsals and before judging.
---

# Skill: Reset demo

## What "reset" means
- Truncate run/ledger data: `agent_runs, agent_steps, handoffs, approvals, jobs, purchase_requests, vendor_quotes, purchase_orders, invoices, payments, goods_receipts` (cascade).
- Re-apply `web/supabase/seed.sql` (customers, vendors + personas, products, the demo deal in `qualifying`/`won`-ready state).
- Clear the `invoices` storage bucket.
- Kill any live `netbird expose` child processes from previous runs.
- Keep users/profiles (judges' logins must survive).

## How
- Implemented once as a SQL function `reset_demo()` (security definer, callable only by `ops_manager`) + a storage cleanup step in the worker.
- Exposed in the UI control bar and as `npm run demo:reset` (targets whatever `SUPABASE_DB_URL` points at — **confirm with the user which environment before running against Vultr**).

## Verify after reset
- The demo deal exists and no runs exist.
- Start scenario → first Sales step appears within a few seconds.
