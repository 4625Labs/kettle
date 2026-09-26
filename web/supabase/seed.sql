-- Minimal demo seed: one customer, three vendors, one won deal ready for fulfillment.

insert into companies (id, name, kind) values
  ('00000000-0000-0000-0000-000000000001', 'Acme Retail Co.', 'customer'),
  ('00000000-0000-0000-0000-000000000002', 'Northwind Supply', 'vendor'),
  ('00000000-0000-0000-0000-000000000003', 'Fabrikam Parts', 'vendor'),
  ('00000000-0000-0000-0000-000000000004', 'Contoso Distribution', 'vendor');

insert into deals (id, company_id, title, stage, value, closed_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Q4 hardware refresh - 200 units', 'won', 48000.00, now());

insert into products (id, name, description) values
  ('20000000-0000-0000-0000-000000000001', 'Business laptop', '14" business laptop, standard config');

insert into deal_line_items (deal_id, product_id, quantity, unit_price) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 200, 240.00);

-- Vendor personas: distinct negotiating styles for the simulated RFQ world (W1, W2).
insert into vendor_personas (vendor_id, persona_prompt, tone, reliability, price_bands) values
  ('00000000-0000-0000-0000-000000000002',
   'You are a sales rep for Northwind Supply, a budget vendor. You win on price, not speed. '
   || 'Quote aggressively low and be upfront that lead times run long.',
   'terse, transactional', 0.75,
   jsonb_build_object('20000000-0000-0000-0000-000000000001', jsonb_build_object('min', 178, 'max', 196))),
  ('00000000-0000-0000-0000-000000000003',
   'You are a sales rep for Fabrikam Parts, a premium vendor. You win on speed and reliability, '
   || 'and your prices reflect it. Emphasize fast lead times and white-glove service.',
   'polished, eager to upsell', 0.97,
   jsonb_build_object('20000000-0000-0000-0000-000000000001', jsonb_build_object('min', 208, 'max', 230))),
  ('00000000-0000-0000-0000-000000000004',
   'You are a sales rep for Contoso Distribution, a mid-market vendor. You compete on being '
   || 'reasonable on both price and lead time. Straightforward, no hard sell.',
   'friendly, straightforward', 0.90,
   jsonb_build_object('20000000-0000-0000-0000-000000000001', jsonb_build_object('min', 190, 'max', 205)));

insert into policies (key, value, description) values
  ('po_approval_threshold', jsonb_build_object('amount', 10000),
   'Purchase orders at or above this amount (USD) require human approval before issuing.'),
  ('match_tolerance_pct', jsonb_build_object('percent', 5),
   'Allowed variance between PO and vendor invoice unit price/quantity before flagging an anomaly.'),
  ('max_steps', jsonb_build_object('count', 20),
   'Max steps an agent run may take before escalating to a human (K6).');

-- Demo users: one per role, dev-only passwords (see web/supabase/README.md). Local/demo DB only —
-- never run this block against a database with real users.
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000001',
   'authenticated', 'authenticated', 'ops@kettle.demo', crypt('kettle-demo', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000002',
   'authenticated', 'authenticated', 'sales@kettle.demo', crypt('kettle-demo', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '40000000-0000-0000-0000-000000000003',
   'authenticated', 'authenticated', 'finance@kettle.demo', crypt('kettle-demo', gen_salt('bf')), now(),
   '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '');

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
   'email', now(), now(), now());

insert into profiles (id, role, full_name) values
  ('40000000-0000-0000-0000-000000000001', 'ops_manager', 'Demo Ops Manager'),
  ('40000000-0000-0000-0000-000000000002', 'sales_rep', 'Demo Sales Rep'),
  ('40000000-0000-0000-0000-000000000003', 'finance_controller', 'Demo Finance Controller');
