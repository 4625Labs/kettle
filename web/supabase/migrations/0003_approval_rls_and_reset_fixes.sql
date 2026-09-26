-- Follow-ups from the schema v2 review:
-- 1. approvals_decide let an approver rewrite any column (amount, required_role, subject_id, ...)
--    and never bound decided_by to the caller. Table-level UPDATE grants are all-or-nothing in
--    Postgres (RLS gates which rows, not which columns), so restrict the grant to the columns a
--    decision actually touches, and bind decided_by in the policy itself.
-- 2. reset_demo() truncated run/ledger data but left the demo deal (and, looking ahead to P7,
--    vendor reliability) in whatever state agents had mutated it to. Restore seed state instead.

-- ============================================================================
-- 1. approvals: column-scoped UPDATE grant + decided_by bound to the caller
-- ============================================================================

revoke update on approvals from authenticated;
grant update (status, decided_by, decided_at, note) on approvals to authenticated;

drop policy if exists approvals_decide on approvals;
create policy approvals_decide on approvals for update
  using (
    status = 'pending'
    and (current_role_name() = required_role or current_role_name() = 'ops_manager')
  )
  with check (
    status in ('approved', 'rejected')
    and decided_by = auth.uid()
  );

-- ============================================================================
-- 2. reset_demo(): also restore the demo deal (and vendor_personas.reliability, ahead of P7)
--    to their seeded values, so a reset always yields a clean golden path.
-- ============================================================================

create or replace function reset_demo()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_role_name() is distinct from 'ops_manager' then
    raise exception 'reset_demo() may only be called by ops_manager';
  end if;

  truncate table
    agent_steps, agent_runs, handoffs, approvals, jobs,
    goods_receipts, payments, invoices, purchase_orders, vendor_quotes, purchase_requests
  restart identity cascade;

  -- Mirrors the values in seed.sql. Keep both in sync if the demo deal changes.
  update deals
  set stage = 'won', value = 48000.00, closed_at = now()
  where id = '10000000-0000-0000-0000-000000000001';

  update vendor_personas
  set reliability = seeded.reliability
  from (values
    ('00000000-0000-0000-0000-000000000002'::uuid, 0.75),
    ('00000000-0000-0000-0000-000000000003'::uuid, 0.97),
    ('00000000-0000-0000-0000-000000000004'::uuid, 0.90)
  ) as seeded(vendor_id, reliability)
  where vendor_personas.vendor_id = seeded.vendor_id;
end;
$$;
