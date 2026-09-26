-- 0002 dropped the demo allow-all policy on deals but only re-added insert/update policies, so
-- signed-in users could not read any deal. Same read rule as the rest of the ledger.

create policy authenticated_read on deals for select using (auth.role() = 'authenticated');
