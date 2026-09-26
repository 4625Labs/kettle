-- 0005: purchase orders at or above po_approval_threshold wait for a human (P4, K4).
-- The approval's subject_id points at the PO row, so the row exists before it is issued:
-- pending_approval -> issued (approved) or cancelled (rejected).

do $$
declare
  c text;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'public.purchase_orders'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%status%'
  loop
    execute format('alter table purchase_orders drop constraint %I', c);
  end loop;
end $$;

alter table purchase_orders
  add constraint purchase_orders_status_check
  check (status in ('pending_approval', 'issued', 'fulfilled', 'cancelled'));
