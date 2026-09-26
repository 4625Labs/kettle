-- 0004: per-run options (W3 anomaly injection) and approval -> job trigger (K4 resume).
-- 1. agent_runs.options carries scenario flags such as {"inject_anomaly": true}; Sim-world reads it
--    when generating the vendor invoice.
-- 2. When a human moves an approval out of pending, enqueue an `approval.decided` job so the
--    worker resumes the waiting agent. Authenticated users can't insert into jobs under RLS, so
--    the trigger function is SECURITY DEFINER.

-- ============================================================================
-- 1. agent_runs.options
-- ============================================================================

alter table agent_runs
  add column options jsonb not null default '{}'::jsonb;

-- ============================================================================
-- 2. approvals: pending -> approved/rejected enqueues approval.decided
-- ============================================================================

create function enqueue_approval_decided()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into jobs (kind, payload)
  values (
    'approval.decided',
    jsonb_build_object(
      'approval_id', new.id,
      'run_id', new.run_id,
      'decision', new.status
    )
  );
  return new;
end;
$$;

create trigger approvals_enqueue_decided
  after update of status on approvals
  for each row
  when (old.status = 'pending' and new.status in ('approved', 'rejected'))
  execute function enqueue_approval_decided();
