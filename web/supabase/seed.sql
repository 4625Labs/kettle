-- Minimal demo seed: one customer, three vendors, one won deal ready for fulfillment.

insert into companies (id, name, kind) values
  ('00000000-0000-0000-0000-000000000001', 'Acme Retail Co.', 'customer'),
  ('00000000-0000-0000-0000-000000000002', 'Northwind Supply', 'vendor'),
  ('00000000-0000-0000-0000-000000000003', 'Fabrikam Parts', 'vendor'),
  ('00000000-0000-0000-0000-000000000004', 'Contoso Distribution', 'vendor');

insert into deals (id, company_id, title, stage, value, closed_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
   'Q4 hardware refresh - 200 units', 'won', 48000.00, now());
