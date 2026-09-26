-- 0006: persist the vendor persona's written quote message (W2) alongside the deterministic
-- price/lead-time fields on vendor_quotes, so the deal/PR UI can show what the vendor actually
-- said. Invoice-time messages (e.g. a dispute reply) travel in the vendor.invoice job's
-- `vendor_message` field instead, since invoices are owned by Finance.

alter table vendor_quotes
  add column message text;
