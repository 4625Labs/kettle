-- Schema v2: agent identity, handoffs (K1), approvals (K4), job queue, auth/roles + RLS,
-- realtime publication, simulated-world tables, and reset_demo().

-- ============================================================================
-- 1. Agent identity on the execution trail
-- ============================================================================

alter table agent_runs
  add column agent text check (agent in ('sales', 'procurement', 'finance', 'orchestrator'));

alter table agent_steps
  add column agent text check (agent in ('sales', 'procurement', 'finance', 'orchestrator')),
  add column rationale text,
  add column model text,
  add column latency_ms integer,
  add column tokens_in integer,
  add column tokens_out integer;

-- ============================================================================
-- 2. Auth & roles
-- ============================================================================

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('ops_manager', 'sales_rep', 'finance_controller')),
  full_name text,
  created_at timestamptz not null default now()
);

-- Returns the caller's role, or null for anon/service-role callers with no profile row.
create function current_role_name()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- ============================================================================
-- 3. Simulated world: products, line items, vendor personas, goods receipts
-- ============================================================================

create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table deal_line_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  product_id uuid not null references products(id) on delete restrict,
  quantity integer not null,
  unit_price numeric(12, 2) not null
);

-- One row per vendor. price_bands is keyed by product_id: {"<product_id>": {"min": x, "max": y}}
-- so a single vendor persona can quote multiple products without a join table.
create table vendor_personas (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null unique references companies(id) on delete cascade,
  persona_prompt text not null,
  tone text not null default 'neutral',
  reliability numeric(3, 2) not null default 0.90 check (reliability between 0 and 1),
  price_bands jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table goods_receipts (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  quantity integer not null,
  status text not null default 'received' check (status in ('received', 'short', 'damaged')),
  received_at timestamptz not null default now()
);

-- ============================================================================
-- 4. Policies (thresholds/tolerances, K7)
-- ============================================================================

create table policies (
  key text primary key,
  value jsonb not null,
  description text
);

-- ============================================================================
-- 5. Handoffs (K1)
-- ============================================================================

create table handoffs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete set null,
  from_agent text not null check (from_agent in ('sales', 'procurement', 'finance', 'orchestrator')),
  to_agent text not null check (to_agent in ('sales', 'procurement', 'finance', 'orchestrator')),
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'done', 'failed', 'rejected')),
  idempotency_key text not null unique,
  deal_id uuid references deals(id) on delete set null,
  purchase_request_id uuid references purchase_requests(id) on delete set null,
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

-- ============================================================================
-- 6. Approvals (K4)
-- ============================================================================

create table approvals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references agent_runs(id) on delete set null,
  subject_type text not null check (subject_type in ('purchase_order', 'payment', 'invoice_correction')),
  subject_id uuid not null,
  requested_by_agent text not null check (requested_by_agent in ('sales', 'procurement', 'finance', 'orchestrator')),
  required_role text not null check (required_role in ('ops_manager', 'sales_rep', 'finance_controller')),
  reason text,
  amount numeric(12, 2),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_by uuid references profiles(id),
  decided_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- 7. Job queue (no extra infra)
-- ============================================================================

create table jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz not null default now()
);

create function claim_job(worker_id text)
returns jobs
language sql
as $$
  update jobs
  set status = 'running', locked_at = now(), locked_by = worker_id, attempts = attempts + 1
  where id = (
    select id from jobs
    where status = 'queued' and run_after <= now()
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

-- ============================================================================
-- 8. Invoices: vendor/line-item/extraction fields (F2, F6)
-- ============================================================================

alter table invoices
  add column vendor_id uuid references companies(id) on delete set null,
  add column unit_price numeric(12, 2),
  add column quantity integer,
  add column file_path text,
  add column extracted jsonb,
  add column extraction_confidence numeric(4, 3);

-- ============================================================================
-- 9. Indexes
-- ============================================================================

create index on agent_runs (agent);
create index on agent_steps (agent);
create index on deal_line_items (deal_id);
create index on deal_line_items (product_id);
create index on vendor_personas (vendor_id);
create index on goods_receipts (purchase_order_id);
create index on handoffs (run_id);
create index on handoffs (status);
create index on handoffs (deal_id);
create index on handoffs (purchase_request_id);
create index on handoffs (purchase_order_id);
create index on handoffs (invoice_id);
create index on approvals (run_id);
create index on approvals (status);
create index on approvals (subject_type, subject_id);
create index on jobs (status, run_after);
create index on invoices (vendor_id);

-- ============================================================================
-- 10. Storage
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('invoices', 'invoices', false)
on conflict (id) do nothing;

-- ============================================================================
-- 11. Realtime publication
-- ============================================================================

alter publication supabase_realtime add table agent_runs, agent_steps, handoffs, approvals;

-- ============================================================================
-- 12. RLS: drop the demo "allow all" policies, replace with role-based access.
-- ============================================================================

do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'companies', 'contacts', 'deals', 'purchase_requests', 'vendor_quotes',
      'purchase_orders', 'invoices', 'payments', 'agent_runs', 'agent_steps'
    ])
  loop
    execute format('drop policy if exists demo_all_access on %I;', t);
  end loop;
end $$;

alter table profiles enable row level security;
alter table products enable row level security;
alter table deal_line_items enable row level security;
alter table vendor_personas enable row level security;
alter table goods_receipts enable row level security;
alter table policies enable row level security;
alter table handoffs enable row level security;
alter table approvals enable row level security;
alter table jobs enable row level security;

-- Everyone signed in can read the world, ledger, and audit trail (U1-U4). No write access here:
-- the agent worker (service role) is the only writer to run/ledger/world data.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'companies', 'contacts', 'products', 'deal_line_items', 'vendor_personas',
      'goods_receipts', 'policies', 'purchase_requests', 'vendor_quotes', 'purchase_orders',
      'invoices', 'payments', 'agent_runs', 'agent_steps', 'handoffs'
    ])
  loop
    execute format(
      'create policy authenticated_read on %I for select using (auth.role() = ''authenticated'');',
      t
    );
  end loop;
end $$;

-- profiles: everyone signed in can read all profiles (needed to show "decided by" etc.);
-- a user may update their own display fields but never their own role.
create policy profiles_read on profiles for select using (auth.role() = 'authenticated');
create policy profiles_update_self on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from profiles where id = auth.uid()));

-- deals: sales_rep and ops_manager can create/edit deals (S1).
create policy deals_write on deals for insert
  with check (current_role_name() in ('sales_rep', 'ops_manager'));
create policy deals_update on deals for update
  using (current_role_name() in ('sales_rep', 'ops_manager'));

-- policies: ops_manager can tune thresholds (K7).
create policy policies_write on policies for update
  using (current_role_name() = 'ops_manager');

-- approvals: everyone signed in sees the inbox (U3); only the assigned role (or ops_manager)
-- may decide a pending approval, and only by moving it out of pending.
create policy approvals_read on approvals for select using (auth.role() = 'authenticated');
create policy approvals_decide on approvals for update
  using (
    status = 'pending'
    and (current_role_name() = required_role or current_role_name() = 'ops_manager')
  )
  with check (status in ('approved', 'rejected'));

-- ============================================================================
-- 13. reset_demo() (see docs/skills/reset-demo.md)
-- ============================================================================

create function reset_demo()
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
end;
$$;
