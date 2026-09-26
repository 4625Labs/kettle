# Deploys

Log of every deploy to VM-A, per `docs/skills/deploy-to-vultr.md`. Format: `SHA, time, result`.

## 2026-09-26 23:33 UTC — `55071a5` — SUCCESS (first deploy)

**What:** `main @ 55071a5` ("Merge agent/infra: NetBird hairpin fix and deploy plan docs"), shipped
via `git archive HEAD | ssh ... tar -x` into `/opt/kettle/releases/55071a5`, `current` symlinked to
it. User-approved.

**Env (`/opt/kettle/current/web/.env`, 600 perms) — names only, values never printed:**
`SUPABASE_URL` (`http://10.10.0.4:8000`, VPC), `NEXT_PUBLIC_SUPABASE_URL`
(`https://api.netbird.4625labs.com`, browser/build-time), `NEXT_PUBLIC_SUPABASE_ANON_KEY` /
`SUPABASE_SERVICE_ROLE_KEY` (piped directly VM-B `/root/supabase/.env` → VM-A over two chained SSH
sessions, renamed from Supabase's own `ANON_KEY`/`SERVICE_ROLE_KEY` in-flight via `sed`, never
displayed), `VULTR_INFERENCE_BASE_URL` / `VULTR_INFERENCE_API_KEY` / `VULTR_INFERENCE_MODEL`
(piped directly from the lead's local `web/.env.local`, same way).

**Build:** `docker compose build` — hit a one-off buildkit snapshot corruption error
(`failed to prepare extraction snapshot ... parent snapshot ... not found`), leftover from an
earlier verification build on this VM. Fixed with `docker builder prune -f` (reclaimed 2.2GB),
rebuilt clean. Both `kettle-web:latest` and `kettle-worker:latest` built successfully.

**Up:** `docker compose up -d` — both containers started.

**Smoke tests, all passed:**
- `curl http://127.0.0.1:3000/api/health` (on VM-A) → `200 {"status":"ok"}`.
- `docker compose ps` → `web` healthy, `worker` running.
- Worker logs: `started with concurrency 4`, then three `heartbeat: processed=0 failed=0
  retried=0 in_flight=0` lines 30s apart — confirms it's alive, connected to Supabase (the
  `claim_job` RPC call succeeds silently every poll; the code only logs on error or on an actual
  claim), and looping correctly. No jobs to claim yet since no demo run has been started — that's
  expected, not a gap.
- `curl -sSi https://kettle.4625labs.com` from VM-C → **`401` with NetBird's password/PIN auth
  page HTML** (`title: NetBird Service`, `window.__DATA__ = {"methods":{"pin":"pin"}}`) — the
  service is correctly gated and gateway-reachable end to end, through the same hairpin-NAT fix
  applied earlier today. (401 is the correct/expected status for an auth challenge — not a bug.)

**Result: full success.** Public demo URL is live and gated; API service was already verified
working; worker is running and idle-healthy on real Supabase.

**Known gaps for next deploy:** no automated smoke-test script yet (all manual); worker has never
processed a real job end-to-end (needs an actual triggered run to prove out `claim_job` +
dispatch, not just idle heartbeat).
