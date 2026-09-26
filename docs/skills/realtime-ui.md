---
name: kettle-realtime-ui
description: Build Kettle's live multi-agent UI — three agent lanes with animated handoffs, step inspector, approvals inbox, deal lifecycle page — driven by Supabase Realtime, and make it demo-legible.
---

# Skill: Realtime multi-agent UI

The hero screen is **not a dashboard** (banned). It is a live view of three agents *doing and
arguing about* work. Charts and KPI tiles are secondary at most.

## Screens
1. **Run view** (hero): three vertical lanes — Sales, Procurement, Finance (+ a thin Orchestrator rail). Each step appears as a card in its lane as it happens; handoffs draw an arrow between lanes. Anomaly/pushback cards are visually distinct (amber); approvals waiting on a human pulse.
2. **Step inspector** (drawer): input, output, rationale, model, latency, tokens, linked ledger records.
3. **Approvals inbox**: filtered by the signed-in user's role; approve/reject with a note; the run visibly resumes.
4. **Deal lifecycle**: deal → PR → quotes (comparison table) → PO → invoices (with the extracted PDF side-by-side) → payments.
5. **Control bar** (demo): "Start scenario", "Inject anomaly", "Reset demo".

## Data flow
- Initial load server-side; then a client component subscribes to Supabase Realtime (`agent_steps`, `handoffs`, `approvals` filtered by `run_id`).
- Order by `(created_at, step_number)`; de-duplicate by id (Realtime can replay).
- Never trust client state for decisions — approvals go through a Server Action that re-checks role and state.

## Design
- Readable from the back of a room: large type for step titles, one-line summaries, color = agent (consistent everywhere), amber = anomaly, green = resolved.
- Motion only for new cards and handoff arrows (≤ 300 ms); respect `prefers-reduced-motion`.
- Works at 1280×720 (projector) and on a phone.
- Empty, loading, and error states for every panel.

## Verify
- Run the golden path in a browser (use the `run` / `claude-in-chrome` skills): cards stream in order, arrows connect the right lanes, anomaly is obvious, approval unblocks the run.
- Screenshot at 1280×720 and check legibility.
