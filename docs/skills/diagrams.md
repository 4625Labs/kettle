---
name: kettle-diagrams
description: Create accurate, presentation-ready diagrams of Kettle (deployment, network path, technical and application architecture, data model, business flows, build process, security boundaries) as Mermaid in the repo, derived from the real code and infra docs.
---

# Skill: Kettle diagrams

Goal: someone who hasn't read the code (the user, a judge) understands Kettle end to end from
pictures. Every diagram answers **one question** and matches what's actually built.

## Catalog: one diagram per question

| # | File (`docs/diagrams/`) | Question it answers | Mermaid type |
|---|---|---|---|
| 1 | `01-system-context.md` | Who and what does Kettle interact with? | `flowchart` |
| 2 | `02-deployment.md` | What runs where on Vultr, and what's public? | `flowchart` with subgraphs per VM |
| 3 | `03-request-path.md` | How does a browser request reach the app with zero open ports? | `sequenceDiagram` |
| 4 | `04-technical-architecture.md` | Which runtime pieces talk to which (web, worker, queue, Realtime, inference)? | `flowchart` |
| 5 | `05-application-architecture.md` | How is the code organized (orchestrator, agents, sim, documents, contracts, ledger)? | `flowchart` |
| 6 | `06-data-model.md` | What's in the shared ledger? | `erDiagram` |
| 7 | `07-golden-path.md` | What happens business-wise, including the anomaly pushback? | `sequenceDiagram` |
| 8 | `08-states-and-approvals.md` | How do POs, invoices, approvals, and handoffs change state? | `stateDiagram-v2` |
| 9 | `09-how-we-built-it.md` | How did the lead + parallel agents build and merge safely? | `flowchart` |
| 10 | `10-security-boundaries.md` | Where are the trust boundaries, secrets, and human gates? | `flowchart` |

`docs/diagrams/README.md` is the index: one line per diagram plus a thumbnail sentence.

## Accuracy rules (non-negotiable)

1. **Derive, don't invent.** Sources of truth: `docs/STATUS.md`, `infra/README.md`,
   `infra/NETBIRD.md`, `web/supabase/migrations/*`, `web/src/lib/contracts/*`,
   `web/src/lib/agent/**`, `web/src/lib/sim/**`, `web/docker-compose.yml`. Read them before drawing.
2. Use real names: `kettle-app`, `kettle-db`, `kettle-netbird`, table names, job kinds, handoff
   types, ports (3000, 8000, 443, 3478/udp), domains (`kettle.4625labs.com`,
   `api.netbird.4625labs.com`, `netbird.4625labs.com`).
3. **Never include secrets**: no keys, passwords, or setup keys. Public IPs are fine; they're in infra docs.
4. Mark anything planned but not built as dashed with a "(planned)" label, e.g. N4 per-run URLs.
5. One idea per diagram; under ~25 nodes. Split rather than cram.

## Visual conventions (match the app's design tokens)

```
classDef sales fill:#DBEAFE,stroke:#2563EB,color:#1E3A8A
classDef procurement fill:#EDE9FE,stroke:#7C3AED,color:#4C1D95
classDef finance fill:#DCFCE7,stroke:#16A34A,color:#14532D
classDef orchestrator fill:#F3F4F6,stroke:#4B5563,color:#111827
classDef human fill:#FEF3C7,stroke:#D97706,color:#78350F
classDef external fill:#FFFFFF,stroke:#9CA3AF,color:#374151,stroke-dasharray:4 3
classDef vultr fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E
classDef danger fill:#FEE2E2,stroke:#DC2626,color:#7F1D1D
```
- Colors = agent identity everywhere (sales blue, procurement violet, finance green, orchestrator gray).
- Amber = human approval; red = anomaly/untrusted input; sky = Vultr-managed; dashed = external/simulated.
- Solid arrows = synchronous calls; dotted (`-.->`) = async jobs/handoffs; label every arrow with *what* moves.
- Left-to-right (`flowchart LR`) for flows, top-down for layers.

## Each diagram file

```markdown
# <Title>
**Question:** <the one question>
<mermaid block>
**How to read it:** 3–5 bullets, plain English.
**Sources:** files this was derived from.
```

## Verify before handing off

- The Mermaid parses: GitHub renders it, or check at the Mermaid live editor with no secrets pasted,
  or with `npx @mermaid-js/mermaid-cli` if installed. Fix syntax errors; don't ship broken blocks.
- Spot-check 3 facts per diagram against the source files.
- When the architecture changes, update the affected diagram in the same commit.

## Presenting

- For the user or judges, the lead can publish the full set as one private HTML page (Artifact tool,
  with the `artifact-design` and `artifact-diagramming` skills loaded) that renders every diagram with
  its "How to read it" notes.
- For slides: diagrams 1, 2, 3, and 7 carry the 3-minute demo story.
