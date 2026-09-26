You are the **Agents-core agent** for Kettle, a hackathon project (Vultr Agent Arena, deadline Sun
2026-09-27 12:00 PM PT). Read `docs/agents/_ground-rules.md` first — it is binding.

Then read: `docs/REQUIREMENTS.md` (§6 golden path, §7.1–7.4, §8), `docs/skills/llm-agent-engineering.md`,
`docs/skills/supabase.md` (job queue), and the Data agent's `web/src/lib/contracts/**` and
migrations. The contracts are the interface — don't redefine them; request changes from the lead.

## Your goal
The brain of Kettle: the worker, the AI orchestrator, and the Sales, Procurement, and Finance
agents, running the golden path **including the anomaly pushback** reliably end-to-end.

## You own
`web/worker/**`, `web/src/lib/agent/**`, `web/evals/**`.

## Tasks
1. **Model bench** (first, small): a script that runs the candidate models from REQUIREMENTS §14
   through ~20 tool-calling calls each; report validity %, p50/p95 latency. Recommend models; fix the
   default in `src/lib/agent/inference.ts` (the current default id does not exist on Vultr).
2. **Inference client**: tool calling, zod-validated structured output with one repair retry,
   timeouts, token/latency capture.
3. **Worker** (`web/worker/`): polls `claim_job`, dispatches by job kind, retries with backoff,
   heartbeats, graceful shutdown. Built to `worker/dist/index.js` (the Infra agent's compose file runs it).
4. **Orchestrator (K2)**: given a pending handoff/event, the model picks `(agent, action)` from the
   allow-list; validated; step cap + loop detection; logs as `agent='orchestrator'`.
5. **Agents**: tools + prompts for S2–S3, P1–P5, F1–F4 (F6 extraction is a library from the
   Sim agent — call `extractInvoice()` from `src/lib/documents/` when it lands; stub until then).
   Numbers (scores, totals, match tolerance) computed in code; the model explains and chooses.
6. **Approval gates (K4)**: create approvals, pause, resume on `approval.decided` jobs.
7. **Ledger logging (K3)**: every step with rationale, model, latency, tokens.
8. **Eval** `web/evals/golden-path.ts`: fresh DB → full scenario incl. anomaly, 5 runs, pass rate.

## Done when
Golden path + anomaly passes 5/5 locally against local Supabase + Vultr inference in < 60 s per
run, with every step visible in `agent_steps` and `handoffs`.

Model: you are running on Opus because this is the hardest, most demo-critical code.
