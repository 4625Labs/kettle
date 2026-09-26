# Kettle: Status & Handoff

Snapshot: **2026-09-26, evening (Sat)**. Deadline: **Sun 2026-09-27 12:00 PM PT**.
Read this first when resuming. Requirement IDs refer to [`REQUIREMENTS.md`](REQUIREMENTS.md);
the agent playbook is [`agents/README.md`](agents/README.md).

## TL;DR

- The agent core works end to end: golden path + anomaly passes **5/5** locally with the real
  Sim-world and Vultr inference (~19 s/run, 16 LLM calls, 0 fallbacks).
- Vultr infra is up: 3 VMs, VPC, firewalls, self-hosted **NetBird** (VM-C) and **Supabase** (VM-B).
  `api.netbird.4625labs.com` answers through NetBird.
- **In flight:** first deploy of `main` @ `55071a5` to VM-A (Infra, user-approved), and Frontend
  Phase 2 (realtime run view, approvals, deal page, control bar).
- **Not started:** QA & docs agent (README/ARCHITECTURE/DEMO, Playwright, video), N4 per-run URLs.
- GitHub `4625Labs/kettle` is **private**, at `a49a43e`. `main` locally is ahead (`55071a5`).
  **Must flip to public before submission.**

## Git

| Ref | Commit | Notes |
|---|---|---|
| local `main` | `55071a5` | everything merged; clean |
| `origin/main` | `a49a43e` | push pending (lead only) |
| `agent/*` branches | all 0 ahead of main | infra, data, frontend, agents-core, simworld |

Only the lead checkout can push or change `main` (hooks + deny rules; see agents/README.md).

## Requirements status

Legend: ✅ done · 🟡 partial / in progress · ⬜ not started

### Sales
| ID | Status | Notes |
|---|---|---|
| S1 create/edit deals UI | ⬜ | demo uses the seeded deal; eval creates its own deals |
| S2 validate on won | ✅ | code checks + LLM rationale |
| S3 emit handoffs | ✅ | purchase_request.create, customer_invoice.create |
| S4 status updates on deal | ✅ | payment.status / receivable.overdue |
| S5 lead qualification | ⬜ | stretch |

### Procurement
| ID | Status | Notes |
|---|---|---|
| P1–P5 | ✅ | RFQ to 3 AI vendors, scoring 50/20/30 in code, PO with `pending_approval` gate (≥ $10k), dispute on anomaly |
| P6 goods receipt | ✅ | simulated |
| P7 vendor reliability learning | ⬜ | reset_demo already restores reliability |

### Finance
| ID | Status | Notes |
|---|---|---|
| F1–F4 | ✅ | receivable, 3-way match with tolerance (5%), anomaly handback, payment gate (finance_controller) |
| F5 overdue follow-up | ✅ | eval `--late` passes |
| F6 PDF → vision extraction | ✅ | `glm-5.3-flash`; low-confidence (<0.7) approval path written, not exercised |
| F7 cash summary | ⬜ | stretch |

### Coordination
| ID | Status | Notes |
|---|---|---|
| K1 handoffs table | ✅ | idempotency keys |
| K2 AI orchestrator | ✅ | allow-list enforced, off-list → forced + flagged, step cap, loop detection |
| K3 step ledger | ✅ | agent, rationale, model, latency, tokens |
| K4 approvals | ✅ | 0004 trigger enqueues `approval.decided`; resume re-reads DB status |
| K5 idempotency/retry | ✅ | backoff to 30 s, lease renewal, stale-job reaper |
| K6 escalation | ✅ | failed handoff + escalate step + run failed |
| K7 policies UI | ⬜ | `policies` table exists (threshold 10k, tolerance 5%, max_steps 20) |

### Simulated world
| ID | Status | Notes |
|---|---|---|
| W1–W5 | ✅ | personas (Northwind/Fabrikam/Contoso), overbill on first invoice only, pdf-lib PDFs, customer on-time/late |

### Web app
| ID | Status | Notes |
|---|---|---|
| U1 live run view | 🟡 | Phase 1 on mock data merged; Phase 2 realtime in progress |
| U2 deal lifecycle page | 🟡 | Phase 2 |
| U3 approvals inbox | 🟡 | Phase 2 (update approvals row only; trigger does the rest) |
| U4 step inspector | 🟡 | built on mock data; wires up in Phase 2 |
| U5 auth + roles | ✅ | roles from `profiles`; no profile = unauthorized |
| U6 landing page | ✅ | |

### Zero-port (NetBird bonus)
| ID | Status | Notes |
|---|---|---|
| N1 no inbound on VM-A | 🟡 | firewall has no public rules; external port-scan evidence pending |
| N2 gated access | 🟡 | `kettle.4625labs.com` password auth (SSO dropped: OIDC discovery failed); verify after deploy |
| N3 Supabase API via NetBird | ✅ | `api.netbird.4625labs.com` → kettle-db:8000, answers (401 health) |
| N4 per-run expiring URLs | ⬜ | Peer Expose enabled; `netbird expose` not implemented |

## Infrastructure (details: `infra/README.md`, `infra/ACTIONS.md`, `infra/NETBIRD.md`)

| VM | Role | Public IP | VPC IP | NetBird IP | State |
|---|---|---|---|---|---|
| VM-A kettle-app | web + worker (Docker) | 64.177.51.161 (no inbound) | 10.10.0.3 | 100.75.158.87 | deploy in progress |
| VM-B kettle-db | Supabase self-host (official compose, Envoy on 8000) | 96.30.205.155 (no inbound) | 10.10.0.4 | 100.75.132.16 | healthy, migrations 0001–0006 + seed + demo users |
| VM-C kettle-netbird | NetBird self-host (Traefik, mgmt, dashboard, proxy) | 144.202.22.122 | 10.10.0.5 | n/a | healthy |

- Region atl, $0.075/h total. VPC 10.10.0.0/24. SSH: laptop → VM-C (root, key) → VPC.
- DNS (BigRock): `netbird` A, `*.netbird` CNAME, `kettle` CNAME (+ a verification CNAME added by the user).
- NetBird: admin account (user-owned), allow-all policy, Peer Expose on, 51820/udp intentionally closed.
- Lessons learned (all recorded in ACTIONS.md):
  - Vultr NetBird and Supabase **marketplace images were broken**; both VMs were reinstalled as plain Ubuntu 24.04 (same IPs).
  - `vpc_ids` at create time was ignored; attached with `/vpcs/attach`.
  - Installing the NetBird client overwrites `/etc/resolv.conf`, which breaks Docker DNS. Fixed with `/etc/docker/daemon.json` dns on VM-A and VM-B.
  - Docker hairpin NAT: `netbird-proxy` couldn't reach its own public domain. Fixed with `extra_hosts: netbird.4625labs.com:172.30.0.10`.
  - The `NETBIRD_AGENT_NETWORK=true` preset hides the dashboard and makes the proxy private; removed from dashboard.env and proxy.env.
  - Supabase `generate-keys.sh` prints secrets; everything except the Postgres password (VPC-only) was rotated silently afterwards. Studio, imgproxy, and edge-functions are stopped.

## Credentials: where they live (never in git or chat)

| Secret | Location |
|---|---|
| Vultr inference key, sub-user API key | lead `web/.env.local` (copied into each worktree) |
| Vultr admin key | removed by the user |
| Supabase JWT/anon/service keys, DB password | VM-B `/root/supabase/.env` (600) |
| Hosted demo user passwords | VM-B `/root/supabase/.env` as `KETTLE_*_PASSWORD`; read: `ssh -J root@144.202.22.122 root@10.10.0.4 "grep KETTLE_ /root/supabase/.env"` (needs the infra SSH key) |
| App runtime env | VM-A `/opt/kettle/.env` (600) |
| NetBird admin login, kettle service password | the user only |
| Local dev demo users | `ops@ / sales@ / finance@kettle.demo`, password `kettle-demo` (local only) |

## Key decisions log

1. Project **Kettle**, Challenge 2, three business agents + AI orchestrator over one shared ledger.
2. AI-played orchestrator, vendors, and extraction; numbers always computed in code.
3. Login required; roles `ops_manager`, `sales_rep`, `finance_controller`.
4. NetBird bonus attempted; nothing installed on the user's laptop.
5. Build agents in git worktrees; only the lead merges and pushes; questions route through the lead.
6. Models: agents `deepseek-v4.1-flash` (p50 0.8 s, 100% valid), personas `laguna-s-2.1`, vision `glm-5.3-flash`.
7. Approval thresholds: PO ≥ $10k needs ops_manager; every payment needs finance_controller.

## Pending, in priority order

1. **Finish first deploy** (Infra, in flight): verify `https://kettle.4625labs.com` → NetBird password → Kettle login; worker claiming jobs on VM-A.
2. **Frontend Phase 2**: realtime run view, approvals inbox, deal page, control bar (start / inject anomaly / reset). Then redeploy.
3. **End-to-end on Vultr**: run the golden path on the deployed stack (extraction uses poppler in the worker image).
4. **N1 evidence**: external port scan of VM-A; **N4** per-run `netbird expose` URLs (P1).
5. **QA & docs agent** (Haiku, `docs/agents/qa-docs.md`): README rewrite with architecture diagram, `docs/ARCHITECTURE.md`, `docs/DEMO.md`, Playwright smoke test.
6. **Demo**: rehearse, 1-minute video from the deployed URL, backup recording.
7. **Submission**: push `main`, **make the repo public**, submit before 12:00 PM Sunday.

## Resuming

- Lead session: the main checkout at `/Users/4625labs/Workspace/Hackathons/vultr-hackathon`.
- Resume an agent: `cd ../kettle-wt/<name> && claude --continue --model <model> --permission-mode acceptEdits`.
  Active: `infra` (Sonnet), `frontend` (Sonnet). Finished and closed: data, agents-core, simworld.
- New agents: `scripts/new-agent-worktree.sh <name>` (applies all locks), then launch per agents/README.md.
- Session names change on restart; agents find the lead by the `vultr-hackathon` name prefix.
- Local Supabase: `cd web && npx supabase start -x studio,logflare,vector,imgproxy,edge-runtime,supavisor,mailpit`.
- Local eval: `cd web && npm run eval` (poppler installed at /opt/homebrew/bin).
- Memory on the Mac is tight (16 GB): at most 2–3 agents plus local Supabase at once.
