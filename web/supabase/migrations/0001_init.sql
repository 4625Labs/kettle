-- Shared ledger: sales (deals) -> procurement (purchase requests/orders) -> finance (invoices/payments)
-- plus the agent execution trail (agent_runs/agent_steps) that is the core "real work" UI.

create extension if not exists "pgcrypto";

create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null check (kind in ('customer', 'vendor', 'both')),
  created_at timestamptz not null default now()
);

create table contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  email text,
  role text,
  created_at timestamptz not null default now()
);

-- Sales
create table deals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  title text not null,
  stage text not null default 'qualifying'
    check (stage in ('qualifying', 'quoted', 'won', 'lost')),
  value numeric(12, 2) not null default 0,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

-- Procurement
create table purchase_requests (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deals(id) on delete set null,
  description text not null,
  quantity integer not null default 1,
  needed_by date,
  status text not null default 'open'
    check (status in ('open', 'comparing', 'awarded', 'cancelled')),
  created_at timestamptz not null default now()
);

create table vendor_quotes (
  id uuid primary key default gen_random_uuid(),
  purchase_request_id uuid not null references purchase_requests(id) on delete cascade,
  vendor_id uuid not null references companies(id) on delete cascade,
  unit_price numeric(12, 2) not null,
  lead_time_days integer not null,
  total_price numeric(12, 2) not null,
  status text not null default 'received'
    check (status in ('requested', 'received', 'selected', 'rejected')),
  submitted_at timestamptz not null default now()
);

create table purchase_orders (
  id uuid primary key default gen_random_uuid(),
  po_number text not null unique,
  purchase_request_id uuid not null references purchase_requests(id) on delete cascade,
  vendor_id uuid not null references companies(id) on delete cascade,
  amount numeric(12, 2) not null,
  status text not null default 'issued'
    check (status in ('issued', 'fulfilled', 'cancelled')),
  created_at timestamptz not null default now()
);

-- Finance
create table invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null,
  direction text not null check (direction in ('payable', 'receivable')),
  purchase_order_id uuid references purchase_orders(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  amount numeric(12, 2) not null,
  due_date date not null,
  status text not null default 'pending'
    check (status in ('pending', 'matched', 'anomaly', 'paid', 'overdue')),
  created_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  amount numeric(12, 2) not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'failed')),
  paid_at timestamptz
);

-- Agent execution trail: the audited record of every action the agent actually took.
create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  goal text not null,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table agent_steps (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs(id) on delete cascade,
  step_number integer not null,
  action text not null,
  input jsonb,
  output jsonb,
  status text not null default 'ok' check (status in ('ok', 'error', 'flagged')),
  created_at timestamptz not null default now()
);

create index on deals (company_id);
create index on purchase_requests (deal_id);
create index on vendor_quotes (purchase_request_id);
create index on purchase_orders (purchase_request_id);
create index on invoices (purchase_order_id);
create index on invoices (deal_id);
create index on payments (invoice_id);
create index on agent_steps (run_id);

-- Hackathon-speed RLS: readable/writable by any authenticated or anon client.
-- Tighten before treating this as anything beyond a demo.
alter table companies enable row level security;
alter table contacts enable row level security;
alter table deals enable row level security;
alter table purchase_requests enable row level security;
alter table vendor_quotes enable row level security;
alter table purchase_orders enable row level security;
alter table invoices enable row level security;
alter table payments enable row level security;
alter table agent_runs enable row level security;
alter table agent_steps enable row level security;

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
    execute format('create policy demo_all_access on %I for all using (true) with check (true);', t);
  end loop;
end $$;
