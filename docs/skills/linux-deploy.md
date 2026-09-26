---
name: kettle-linux-deploy
description: Package and run Kettle on a Vultr Ubuntu VM — Docker Compose for the Next.js app and agent worker, environment/secret handling, logs, health checks, and repeatable deploys.
---

# Skill: Linux deployment (Docker Compose on Ubuntu)

## Layout on VM-A
```
/opt/kettle/
  docker-compose.yml     # services: web (next start), worker (node worker)
  .env                   # 600 perms, owned by deploy user, never in git
  releases/<git-sha>/    # optional: last N builds for rollback
```

## Rules
- Multi-stage `Dockerfile` in `web/`: deps → build → slim runtime (Node LTS matching `web/package.json` engines). Run as non-root.
- `web` listens on `127.0.0.1:3000` only (NetBird reaches it locally; nothing is published on `0.0.0.0`).
- `worker` has no ports at all.
- `restart: unless-stopped`, healthchecks (`/api/health` for web; a heartbeat row or file for worker).
- Logs: `docker compose logs -f web worker`; keep JSON logs small (rotate: `max-size: 10m`).
- Secrets only via `.env` on the VM. Build args never contain secrets. `NEXT_PUBLIC_*` values are public by definition — never put keys there except the Supabase anon key.

## Deploy flow (becomes the `deploy-to-vultr` skill)
1. Local: `npm run build` and tests pass on the commit being deployed.
2. Ship code: `git archive <sha>` (or `rsync`) to VM-A over SSH via the VM-C jump host. No GitHub dependency and no NetBird on the laptop.
3. On VM-A: `docker compose build && docker compose up -d`.
4. Run DB migrations against VM-B from VM-A.
5. Smoke test through the public NetBird URL.
6. Rollback: `docker compose` up the previous release.

## Verify
- `ss -tlnp` on VM-A shows nothing listening on public interfaces except the NetBird WireGuard interface.
- Rebooting VM-A brings both services back without manual steps.
