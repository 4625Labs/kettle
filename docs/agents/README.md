# Kettle build agents

> **Current status and what's pending: [`../STATUS.md`](../STATUS.md).** Waves 1–2 are complete and
> merged (infra, data, frontend phase 1, agents-core, simworld). Frontend phase 2 and Infra's
> deploy are in flight. QA & docs (wave 3) hasn't started.

One **lead** session (Opus, the main repo checkout) plus up to **six build agents**, each in its own
git worktree and branch. The lead reviews and merges locally. Nothing is pushed.

## Roster

| Agent | Model | Prompt | Owns | Wave |
|---|---|---|---|---|
| Lead / integrator | Opus 5.5 | (this session) | `docs/**`, merges, reviews | always |
| Infra | Sonnet 5 | `infra.md` | `infra/**`, Dockerfile, compose, `/api/health` | 1 |
| Data | Sonnet 5 | `data.md` | `web/supabase/**`, `src/lib/contracts/**`, types | 1 |
| Frontend | Sonnet 5 | `frontend.md` | `src/app/**`, `src/components/**` | 1 (phase 1) → 2 |
| Agents-core | **Opus 5.5** | `agents-core.md` | `web/worker/**`, `src/lib/agent/**`, `web/evals/**` | 2 |
| Sim-world | Sonnet 5 | `simworld.md` | `src/lib/sim/**`, `src/lib/documents/**` | 2 |
| QA & docs | Haiku 4.5 | `qa-docs.md` | `web/tests/**`, `README.md`, `docs/DEMO.md`, `docs/ARCHITECTURE.md` | 3 |

Every agent reads `_ground-rules.md` first and the skill files it's pointed to in `docs/skills/`.

## How many can run in parallel?

There's no fixed session cap that I can vouch for. The practical limits are:

1. **Your plan's usage and rate limits.** Opus sessions use them up fastest. Several long-running
   sessions at once can hit limits mid-task.
2. **Your Mac.** Each worktree has its own `node_modules` (~400 MB), and each dev server needs a port.
   Local Supabase (Docker) is shared.
3. **Merge and review bandwidth.** Every branch comes back through the lead. More than about 4
   branches in flight means conflicts and reviews start to slow everything down.

**Recommendation: at most 4 build agents at once, plus the lead.** Run them in waves:

| Wave | When | Runs in parallel | Unblocked by |
|---|---|---|---|
| 1 | Now | Infra, Data, Frontend (phase 1) — **3** | nothing |
| 2 | Data merged (~1.5–2 h) | Agents-core, Sim-world, Frontend (phase 2), Infra (if still going) — **4** | Data's contracts + migration |
| 3 | Golden path works locally | QA & docs, plus whichever agents are finishing up | a working build |

## Launch commands

Run once from the main checkout to commit the docs so the worktrees get them:

```bash
cd /Users/4625labs/Workspace/Hackathons/vultr-hackathon
git status            # should be clean before creating worktrees
mkdir -p ../kettle-wt
```

Then **one terminal per agent**. `scripts/new-agent-worktree.sh <name>` creates the worktree and
branch, applies every lock (see "Only the lead pushes and merges" below), copies your local env
(gitignored, so it isn't in the worktree), and installs dependencies. Then Claude Code starts with
the agent's starting prompt:

```bash
# ---- Wave 1 ----

# Infra (Sonnet)
cd /Users/4625labs/Workspace/Hackathons/vultr-hackathon && scripts/new-agent-worktree.sh infra
cd ../kettle-wt/infra && claude --model sonnet --permission-mode acceptEdits "$(cat docs/agents/infra.md)"

# Data (Sonnet)
cd /Users/4625labs/Workspace/Hackathons/vultr-hackathon && scripts/new-agent-worktree.sh data
cd ../kettle-wt/data && claude --model sonnet --permission-mode acceptEdits "$(cat docs/agents/data.md)"

# Frontend (Sonnet): dev server on port 3001
cd /Users/4625labs/Workspace/Hackathons/vultr-hackathon && scripts/new-agent-worktree.sh frontend
cd ../kettle-wt/frontend && claude --model sonnet --permission-mode acceptEdits "$(cat docs/agents/frontend.md) Use port 3001 for your dev server (npm run dev -- -p 3001)."

# ---- Wave 2 (after agent/data is merged into main) ----

# Agents-core (Opus): dev server on port 3002
cd /Users/4625labs/Workspace/Hackathons/vultr-hackathon && scripts/new-agent-worktree.sh agents-core
cd ../kettle-wt/agents-core && claude --model opus --permission-mode acceptEdits "$(cat docs/agents/agents-core.md) Use port 3002 if you run the dev server."

# Sim-world (Sonnet): dev server on port 3003
cd /Users/4625labs/Workspace/Hackathons/vultr-hackathon && scripts/new-agent-worktree.sh simworld
cd ../kettle-wt/simworld && claude --model sonnet --permission-mode acceptEdits "$(cat docs/agents/simworld.md) Use port 3003 if you run the dev server."

# Frontend phase 2: in the existing frontend terminal, tell the agent:
#   "Data contracts are merged. Run git merge main, then start Phase 2."

# ---- Wave 3 ----

# QA & docs (Haiku): dev server on port 3004
cd /Users/4625labs/Workspace/Hackathons/vultr-hackathon && scripts/new-agent-worktree.sh qa-docs
cd ../kettle-wt/qa-docs && claude --model haiku --permission-mode acceptEdits "$(cat docs/agents/qa-docs.md) Use port 3004 if you run the dev server."
```

## Only the lead pushes and merges

Enforced in three layers, tested on 2026-09-26:

| Layer | Where | Blocks |
|---|---|---|
| Git hooks (`scripts/git-guards/`, installed in the shared `.git/hooks`) | every worktree | `pre-push`: any push not from the lead checkout. `reference-transaction`: any change to `main` from a worktree (merge, commit, reset, update-ref), even with `--no-verify` |
| Per-worktree git config | each agent worktree | Push URL is a dead `no-push://` address and GitHub credentials are unset, so even `git push --no-verify` can't reach GitHub |
| Claude Code deny rules (`docs/agents/worktree-settings.local.json` → `.claude/settings.local.json`) | each agent session | `git push`, `gh`, `git remote`, `git config`, `git -c`, `git checkout/switch main`, `git update-ref`, `git branch -f/-D/-m`, `--no-verify` commits, `git worktree`, edits to `.git/`, the guard scripts, and its own `.claude/` settings |

Agents can still commit to their own branch and run `git merge main` to bring updates in.
The lead checkout isn't affected by any of these.

`--permission-mode acceptEdits` lets an agent edit files in its worktree without asking; shell commands
still prompt in its terminal. Questions and decisions go to the lead session (ground rule 0), which
brings you only what needs your decision.

## Merge loop (lead session)

When an agent posts its hand-off summary, tell the lead: **"review and merge agent/<name>"**. The lead:
1. Reads the diff (`git diff main...agent/<name>`) and checks the lane rules.
2. Runs type-check, lint and build on the merge result.
3. Merges into `main` locally, and tells the other running agents to `git merge main` if they depend on it.

Cleanup when an agent is done: `git worktree remove ../kettle-wt/<name>` (branch is kept).

## Alternative: launch from the lead session

Instead of separate terminals, the lead can spawn agents in isolated worktrees itself (same models
and prompts). You'd follow them in one place, but each agent's approval prompts come through the
lead. Separate terminals keep you in direct control of each agent, so that's the default here.
