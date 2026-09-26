# Kettle diagrams

Ten diagrams, each answering one question about Kettle, derived from the real code and infra docs
(see `docs/skills/diagrams.md` for the catalog, conventions, and accuracy rules this set follows).
For the demo, diagrams 1, 2, 3, and 7 carry the 3-minute story.

| # | Diagram | Question | Thumbnail |
|---|---|---|---|
| 1 | [`01-system-context.md`](./01-system-context.md) | Who and what does Kettle interact with? | Three human roles, three simulated vendors, one simulated customer, Vultr inference, and Supabase — all reached only through NetBird. |
| 2 | [`02-deployment.md`](./02-deployment.md) | What runs where on Vultr, and what's public? | Three VMs — only `kettle-netbird` (VM-C) has a public port; `kettle-app` (VM-A) and `kettle-db` (VM-B) accept nothing from the internet. |
| 3 | [`03-request-path.md`](./03-request-path.md) | How does a browser request reach the app with zero open ports? | Browser → Traefik → netbird-proxy → app, hopping the NetBird overlay network the whole way, never a public port on VM-A or VM-B. |
| 4 | [`04-technical-architecture.md`](./04-technical-architecture.md) | Which runtime pieces talk to which (web, worker, queue, Realtime, inference)? | Web reads the ledger read-only; the worker polls Postgres as a queue and is the only writer; three models split reasoning, persona text, and vision. |
| 5 | [`05-application-architecture.md`](./05-application-architecture.md) | How is the code organized (orchestrator, agents, sim, documents, contracts, ledger)? | Contracts define the vocabulary; the orchestrator routes; three agent files never call each other directly; Sim-world and Documents stand in for the outside world. |
| 6 | [`06-data-model.md`](./06-data-model.md) | What's in the shared ledger? | One business spine (deals → POs → invoices → payments) and one audit spine (runs → steps → handoffs → approvals), meeting at `deals`. |
| 7 | [`07-golden-path.md`](./07-golden-path.md) | What happens business-wise, including the anomaly pushback? | Won deal → RFQ → PO (approval) → overbilled invoice → dispute → corrected invoice → payment (approval) → customer settles. |
| 8 | [`08-states-and-approvals.md`](./08-states-and-approvals.md) | How do POs, invoices, approvals, and handoffs change state? | Five concurrent lifecycles per run; the payable invoice's `anomaly → pending` loop is the pushback in state-machine form. |
| 9 | [`09-how-we-built-it.md`](./09-how-we-built-it.md) | How did the lead + parallel agents build and merge safely? | One lead checkout, up to four build agents in their own git worktrees, three independent layers stopping anyone but the lead from pushing. |
| 10 | [`10-security-boundaries.md`](./10-security-boundaries.md) | Where are the trust boundaries, secrets, and human gates? | Public perimeter, service-role key scope, untrusted vendor text/images treated as data, and three money-moving human approval gates. |

## Conventions

Colors mean the same thing in every diagram: sales blue, procurement violet, finance green,
orchestrator gray, human amber, Vultr-managed sky, external/simulated white-dashed, danger/untrusted
red. Solid arrows are synchronous calls; dotted arrows are async jobs, handoffs, or LLM calls. Anything
marked **(planned)** — currently only N4's per-run `netbird expose` URLs — is drawn dashed because it
isn't built yet, not because it's uncertain.
