-- Creates (or updates the password of) the 3 demo users against a HOSTED Supabase DB, using
-- passwords from env vars instead of seed.sql's hardcoded local-only "kettle-demo" password.
-- Idempotent: safe to re-run (e.g. to rotate passwords before a demo/judging session).
--
-- Usage:
--   KETTLE_OPS_PASSWORD=... KETTLE_SALES_PASSWORD=... KETTLE_FINANCE_PASSWORD=... \
--     psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f web/supabase/create-demo-users.sql
--
-- Requires the same fixed user/company ids seed.sql uses (companies/profiles are still seeded
-- normally by seed.sql or by whatever bootstraps the hosted DB; this script only sets auth.users
-- password + auth.identities + profiles for the 3 demo accounts).

\getenv kettle_ops_password KETTLE_OPS_PASSWORD
\getenv kettle_sales_password KETTLE_SALES_PASSWORD
\getenv kettle_finance_password KETTLE_FINANCE_PASSWORD

\if :{?kettle_ops_password}
\else
  \warn 'KETTLE_OPS_PASSWORD is not set'
  \quit
\endif
\if :{?kettle_sales_password}
\else
  \warn 'KETTLE_SALES_PASSWORD is not set'
  \quit
\endif
\if :{?kettle_finance_password}
\else
  \warn 'KETTLE_FINANCE_PASSWORD is not set'
  \quit
\endif

create extension if not exists "pgcrypto";

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'ops@kettle.demo',
   crypt(:'kettle_ops_password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'sales@kettle.demo',
   crypt(:'kettle_sales_password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'finance@kettle.demo',
   crypt(:'kettle_finance_password', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '')
on conflict (id) do update set
  encrypted_password = excluded.encrypted_password,
  updated_at = now();

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001',
   jsonb_build_object('sub', '40000000-0000-0000-0000-000000000001', 'email', 'ops@kettle.demo'),
   'email', now(), now(), now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002',
   jsonb_build_object('sub', '40000000-0000-0000-0000-000000000002', 'email', 'sales@kettle.demo'),
   'email', now(), now(), now()),
  (gen_random_uuid(), '40000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003',
   jsonb_build_object('sub', '40000000-0000-0000-0000-000000000003', 'email', 'finance@kettle.demo'),
   'email', now(), now(), now())
on conflict (provider, provider_id) do update set
  identity_data = excluded.identity_data,
  updated_at = now();

insert into profiles (id, role, full_name) values
  ('40000000-0000-0000-0000-000000000001', 'ops_manager', 'Demo Ops Manager'),
  ('40000000-0000-0000-0000-000000000002', 'sales_rep', 'Demo Sales Rep'),
  ('40000000-0000-0000-0000-000000000003', 'finance_controller', 'Demo Finance Controller')
on conflict (id) do update set
  role = excluded.role,
  full_name = excluded.full_name;
