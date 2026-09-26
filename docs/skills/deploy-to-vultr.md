---
name: kettle-deploy-to-vultr
description: Deploy the current local commit of Kettle to VM-A on Vultr (build, ship, migrate, restart, smoke test, rollback). Use whenever the user asks to deploy or redeploy Kettle.
---

# Skill: Deploy Kettle to Vultr

Project runbook. Every agent deploys the same way. **Ask the user before running a deploy.**

## Preconditions
- Working tree clean; you know the exact commit SHA being deployed.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` pass locally in `web/`.
- NetBird is up locally so VM-A is reachable over its NetBird IP (VM-A has no public ports).

## Steps
1. `SHA=$(git rev-parse --short HEAD)`
2. Ship: `git archive --format=tar HEAD | ssh kettle-app "mkdir -p /opt/kettle/releases/$SHA && tar -x -C /opt/kettle/releases/$SHA"`
3. On VM-A: point `/opt/kettle/current` at the release, `docker compose build && docker compose up -d`.
4. Migrate: apply new files from `web/supabase/migrations/` to VM-B (over the VPC) in order; stop on the first error.
5. Smoke: `curl -fsS` the public NetBird URL `/api/health` (with the proxy auth), then open the run view.
6. Record: append `SHA, time, result` to `infra/DEPLOYS.md`.

## Rollback
Point `/opt/kettle/current` at the previous release and `docker compose up -d`. Migrations are forward-only — write a new migration to undo a schema change.

## Never
- Deploy uncommitted code, print secrets, or open a firewall port to "just test".
