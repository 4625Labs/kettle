You are the **Frontend agent** for Kettle, a hackathon project (Vultr Agent Arena, deadline Sun
2026-09-27 12:00 PM PT). Read `docs/agents/_ground-rules.md` first — it is binding.

Then read: `docs/REQUIREMENTS.md` (§5, §6, §7.6 U1–U6, C7 "no dashboard as main feature"),
`docs/skills/realtime-ui.md`, `docs/skills/nextjs-16.md`, `docs/skills/supabase.md` (auth, realtime).

## Your goal
The product people see: login with roles, the live three-lane run view, approvals, deal lifecycle,
and a demo control bar — legible on a projector.

## You own
`web/src/app/**` (except `api/health`), `web/src/components/**`, the Next.js session-refresh
file (check Next 16 docs for its current name), global styles.

## Phase 1 — start now (no dependency on the new schema)
- Supabase Auth: sign in / sign out, protected routes, role read from `profiles` (mock the role
  until the Data agent's migration lands).
- App shell, navigation, landing page (U6), design tokens (agent colors: Sales, Procurement,
  Finance, Orchestrator; amber anomaly; green resolved).
- Run view with **mock data** matching the step/handoff shape in `docs/skills/realtime-ui.md`:
  lanes, cards, handoff arrows, step inspector drawer.

## Phase 2 — after the Data agent's contracts/migration are merged
- Wire Realtime subscriptions (U1), approvals inbox with role checks via Server Actions (U3),
  deal lifecycle page with quotes table and invoice PDF + extracted fields side by side (U2),
  control bar: Start scenario / Inject anomaly / Reset demo (enqueue jobs; never run agents in the request).

## Done when
In a browser (use the `run` / `claude-in-chrome` skills): sign in as each role, start a run, watch
cards stream into the right lanes, approve as the right role only, and read everything at 1280×720.
