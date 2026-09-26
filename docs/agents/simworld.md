You are the **Sim-world agent** for Kettle, a hackathon project (Vultr Agent Arena, deadline Sun
2026-09-27 12:00 PM PT). Read `docs/agents/_ground-rules.md` first — it is binding.

Then read: `docs/REQUIREMENTS.md` (§6, §7.5 W1–W5, F6), `docs/skills/llm-agent-engineering.md`
(vision extraction, untrusted input), `docs/skills/supabase.md` (storage), and the Data agent's
`web/src/lib/contracts/**`.

## Your goal
Make the outside world believable: AI-played vendors and customers, real-looking invoice PDFs, and
the vision extraction that turns a PDF back into structured data.

## You own
`web/src/lib/sim/**`, `web/src/lib/documents/**`.

## Tasks
1. **Vendor personas (W2)**: handlers for `vendor.rfq` and `vendor.dispute` jobs. The persona model
   writes the message; **price and lead time come from code** within the persona's band. Output is
   schema-validated. Responses are written back as vendor quotes / messages and enqueue the next job.
2. **Anomaly injection (W3)**: a flag on the run makes the selected vendor overbill (e.g. $212 vs
   quoted $195 unit price) on its first invoice, and send a corrected one after a valid dispute.
3. **Invoice PDFs (W5)**: generate a realistic vendor invoice PDF (vendor header, invoice #, PO #,
   line items, totals, due date) and upload to the `invoices` bucket; enqueue `vendor.invoice`.
4. **Extraction (F6)**: `extractInvoice(filePath)` → render page(s) to PNG server-side → Vultr vision
   model → zod-validated fields + per-field confidence. Pick the model with a quick bench of the vision
   candidates in REQUIREMENTS §14.
5. **Customer sim (W4, P1)**: pays on time or late based on a run flag.
6. **Safety**: persona output is untrusted — strip/escape it, never let it carry instructions into
   agent prompts; optional screening with `nemotron-3.5-content-safety`.

## Done when
Given a PO, you can produce: 3 quotes → an overbilled PDF invoice → a correct extraction of it
(including the wrong unit price) → a corrected invoice after dispute. Unit-testable without the
agents-core agent (call your handlers directly).
