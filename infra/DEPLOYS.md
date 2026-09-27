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

## 2026-09-27 00:13 UTC — `47c17bd` — SUCCESS (bundled secret rotation + redeploy)

**What:** combined window, user-approved. Deployed **`main @ 47c17bd`**, not the originally-named
`7b52110` — main had simply moved forward in the meantime with exactly the N4 frontend pieces
(per-run link banner + read-only `/r/[runId]` page, commits `1f5d892`/`c419982`), confirmed
`7b52110` is an ancestor (no divergence) before deploying the newer commit instead.

**Rotation (VM-B), immediately before this deploy so nothing ran with mismatched keys:**
`JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY`/JWKS/publishable+secret/`DASHBOARD_PASSWORD`/S3 keys
regenerated via the suppressed-output procedure; `POSTGRES_PASSWORD` checked for `|`/`&` (none
found) and restored via the sed guard. `sh run.sh recreate` — this also silently un-stopped
Studio/imgproxy/edge-functions (recreate rebuilds the whole stack from the compose file, not just
the containers that were running) — re-stopped those three immediately after. Vultr Inference key
was rotated separately by the user via the Vultr console; the lead verified it worked (`200`)
without printing it.

**Env for the new release (`/opt/kettle/current/web/.env`, 600 perms):** old key lines removed,
fresh `NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` piped directly from VM-B
(renamed in-flight from `ANON_KEY`/`SERVICE_ROLE_KEY`), fresh `VULTR_INFERENCE_*` piped directly
from the lead's local `web/.env.local`. No value ever printed.

**Build/up:** `docker compose build` (bakes the new anon key into the web image) → both images
built clean. `docker compose up -d` → both containers recreated, both port bindings
(`127.0.0.1:3000`, `100.75.158.87:3000`) preserved from the earlier 502 fix.
`systemctl restart kettle-expose-watcher` — it only sources `.env` once at startup, so it needed a
restart to pick up the new service-role key. Clean restart, no crash.

**Verified, all passed:**
- `curl http://127.0.0.1:3000/api/health` → `200 {"status":"ok"}`.
- Worker: started, then two clean `heartbeat` lines 30s apart — new service-role key works.
- Demo sign-in (`ops@kettle.demo`, unchanged password) → `200`, valid access token — new anon key
  works.
- `curl -sSI https://kettle.4625labs.com` from VM-C → `401` (NetBird auth page, as expected).
- `curl https://api.netbird.4625labs.com/auth/v1/health` → `401` (real GoTrue response).

**Result: full success.** All three rotated secrets (JWT/anon/service-role, Vultr Inference key)
now in place end to end; app, worker, and N4 watcher all confirmed working on the new keys.

## 2026-09-27 00:44 UTC — `e668acc` — SUCCESS (worker font fix + deal page + polish)

**What:** `main @ e668acc` — worker image font fix (F6 bug from earlier today), deal page,
frontend polish, regenerated Supabase types, docs. No key changes (reused the existing
`/opt/kettle/current/web/.env`, copied byte-for-byte into the new release dir, not regenerated).
No new migrations (0007 already applied to VM-B).

**Steps:** `git archive` to `/opt/kettle/releases/e668acc`, copied the prior release's `.env` in
(600 perms), pointed `current` at it, `docker compose build && up -d`, restarted
`kettle-expose-watcher`.

**New step 6 — F6 render smoke check (first time running this):** downloaded the same known
invoice PDF (`PO-8199120/CD-8199120.pdf`) inside the worker container via Node's built-in `fetch`,
ran `pdftoppm -png -r 150` on it exactly as `render-pdf.ts` does → **70916 bytes, zero font
errors** (well above the ~30KB threshold; this morning's blank-render bug would have produced
~8.5KB here). Confirms the font fix works in the actual redeployed image, not just the earlier
live-patched test container.

**Verified, all passed:**
- `/api/health` → `200`.
- Worker: clean start, 2 heartbeat lines.
- `kettle-expose-watcher`: clean restart, no crash.
- Demo sign-in (`ops@kettle.demo`) → `200`, valid access token.
- `curl -sSI https://kettle.4625labs.com` from VM-C → `401` (auth page, as expected).

**Result: full success.**

## 2026-09-27 01:15 UTC — `9bdd22c` — SUCCESS (frontend-only: run link → /r/[runId])

**What:** `main @ 9bdd22c` — run-link banner now points directly to `/r/<runId>`, plus copy
tweaks. No key changes (reused `.env` byte-for-byte), no migrations.

**Steps:** same as the previous deploy — ship, copy `.env` into new release dir, `docker compose
build && up -d`, restart `kettle-expose-watcher`.

**F6 render smoke check:** same known invoice PDF → **70916 bytes**, zero font errors. Consistent
with the last deploy.

**Verified, all passed:** `/api/health` → `200`; worker clean start + 2 heartbeats; watcher clean
restart; demo sign-in → `200` with access token; `curl -sSI https://kettle.4625labs.com` → `401`.

**Result: full success.**
