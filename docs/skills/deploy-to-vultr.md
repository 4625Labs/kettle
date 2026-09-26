---
name: kettle-deploy-to-vultr
description: Deploy the current local commit of Kettle to VM-A on Vultr (build, ship, migrate, restart, smoke test, rollback). Use whenever the user asks to deploy or redeploy Kettle.
---

# Skill: Deploy Kettle to Vultr

Project runbook. Every agent deploys the same way. **Ask the user before running a deploy.**

## Preconditions
- Working tree clean; you know the exact commit SHA being deployed.
- `npx tsc --noEmit`, `npm run lint`, `npm run build` pass locally in `web/`.
- VM-A has no public ports. Reach it through VM-C as a jump host. `~/.ssh/config` entries:
  `Host kettle-netbird` (VM-C public IP) and `Host kettle-app` (VM-A **private** IP, `ProxyJump kettle-netbird`).
  Nothing NetBird-related runs on the laptop.

## Steps
1. `SHA=$(git rev-parse --short HEAD)`
2. Ship: `git archive --format=tar HEAD | ssh kettle-app "mkdir -p /opt/kettle/releases/$SHA && tar -x -C /opt/kettle/releases/$SHA"` (goes via the jump host)
3. On VM-A: point `/opt/kettle/current` at the release, `docker compose build && docker compose up -d`.
4. Migrate: apply new files from `web/supabase/migrations/` to VM-B (over the VPC) in order; stop on the first error.
5. Smoke: `curl -fsS https://kettle.4625labs.com/api/health` (with the proxy auth), then open the run view.
6. Record: append `SHA, time, result` to `infra/DEPLOYS.md`.

## Rollback
Point `/opt/kettle/current` at the previous release and `docker compose up -d`. Migrations are forward-only — write a new migration to undo a schema change.

## Never
- Deploy uncommitted code, print secrets, or open a firewall port to "just test".
