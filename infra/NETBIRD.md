# NetBird — status

Single source of truth for the NetBird zero-port bonus (REQUIREMENTS §7.7 N1–N4). Values here only;
secrets/setup keys live in env files, never in this doc.

## 1. Checklist

| Item | Status |
|---|---|
| VM-C created | **done** (rebuilt once — see below) |
| DNS records added and verified (`dig @1.1.1.1`) | **done** |
| Dashboard reachable + admin created | **done** — user confirmed admin account works, Peers shows kettle-app and kettle-db |
| VM-A peer | **done** |
| VM-B peer | **done** |
| Peer Expose enabled (account setting) | **done** — user confirmed |
| `kettle.4625labs.com` service active | user created it; **blocked** — see below, not yet reachable |
| Auth configured (SSO/password gating the service) | done as part of service creation (not independently verified — service itself isn't reachable yet) |
| Supabase API service active | user created it; **blocked** — same root cause |
| VM-A port scan clean (no public ports) | todo |
| Per-run `netbird expose` working and expiring | todo |

Overall: **6/11 done**, but **2 new blockers found** verifying the services — see below.

## 2. Bonus scorecard

| Criterion | Evidence |
|---|---|
| No open ports (VM-A) | not yet — pending NetBird client + peer setup on VM-A |
| Gated access | not yet — dashboard is live at `https://netbird.4625labs.com` (`200`, valid Let's Encrypt cert) but no admin user exists yet; pending service auth config |
| Lifecycle-bound URLs | not yet — pending worker integration of `netbird expose` (NetBird Proxy component is running, confirmed via `docker ps`) |

## 3. What was done

### 2026-09-26 — Planning only (no resources yet)
- Reviewed NetBird reverse-proxy (beta), `netbird expose` CLI, and Vultr marketplace image docs.
- Decided topology: VM-C = self-hosted NetBird (management + reverse proxy), VM-A and VM-B = peers.
  No NetBird client on the developer's laptop; admin SSH reaches VM-A/VM-B via VM-C as a jump host
  over the VPC.
- Names chosen: dashboard `netbird.4625labs.com`, app `kettle.4625labs.com` (custom domain — not
  yet confirmed supported by NetBird's reverse proxy; fallback `kettle.netbird.4625labs.com`),
  per-run URLs `run-<shortid>.netbird.4625labs.com`.
- Mapped bonus criteria to REQUIREMENTS N1–N4.
- Confirmed via Vultr API that the `netbird-server` marketplace image exists (`image_id:
  netbird-server`, "NetBird Server on Ubuntu 24.04 LTS").

Nothing billable has been created yet — topology/cost plan is pending user approval.

### 2026-09-26 — Firewall group created; blocked on VM creation
- Created `fw-kettle-netbird` firewall group (id `35d7669d-195c-46a8-9d93-1d65078407a5`) with
  SSH-only rules so far (VPC + admin fallback IP).
- Confirmed exact public ports NetBird's reverse-proxy mode needs from
  `docs.netbird.io/selfhosted/selfhosted-guide`: `80/tcp`, `443/tcp`, `3478/udp`.
- **Blocked, then resolved:** this session's own auto-mode permission classifier refused (a) adding
  the public `80/443/3478` firewall rules and (b) creating the VM-C instance itself (and VM-A/VM-B),
  since both are real-money/security-sensitive actions the agent isn't allowed to self-approve even
  with a relayed go-ahead. The user then approved both directly in this session's own terminal,
  which cleared the classifier. See `infra/ACTIONS.md` for the full call log.

### 2026-09-26 — VM-C created
- Public firewall rules added to `fw-kettle-netbird`: `80/tcp`, `443/tcp`, `3478/udp` from
  `0.0.0.0/0` (NetBird reverse-proxy ports, confirmed from current docs).
- VM-C (`kettle-netbird`) created: NetBird Server marketplace app, `image_id: netbird-server`,
  region `atl`, plan `vc2-2c-2gb`. Required app variable `nb_domain` set to
  `netbird.4625labs.com`; `acme_email` left unset (didn't want to send the user's email to Let's
  Encrypt without being asked — the ACME account can be configured later from the VM if wanted).
- Public IP `144.202.22.122`, private VPC IP `10.10.0.5`.
- **Next needed from the user:** add the BigRock DNS records (see §4 below) pointing at this IP,
  then this agent can verify with `dig @1.1.1.1` from a VM and open the dashboard to create the
  admin account.

### 2026-09-26 — Marketplace image never worked; rebuilt VM-C on plain Ubuntu + real NetBird install
- DNS was added by the user and initially looked fine externally, but VM-C itself never answered
  any connection (22/80/443 all "connection refused" for 30+ minutes). Console access revealed the
  marketplace image's default account is `linuxuser` (not `root`), our SSH key never reached it,
  and login failed even with the dashboard password — the image itself was broken, not just a
  wrong-account issue.
- Decision (user-approved): abandon the marketplace image. `PATCH`'d the same instance to plain
  Ubuntu 24.04 (`os_id 2284`, same as VM-A) with cloud-init that installs our SSH key for root and
  pre-installs Docker/jq. **Same public IP preserved (`144.202.22.122`)** — no DNS re-work needed.
- Ran NetBird's own official self-hosted installer (`getting-started.sh` from
  `github.com/netbirdio/netbird` releases) directly over SSH, non-interactively
  (`NETBIRD_NON_INTERACTIVE=true NETBIRD_AGENT_NETWORK=true NETBIRD_DOMAIN=netbird.4625labs.com
  NETBIRD_LETSENCRYPT_EMAIL=<user-provided, LE-only, not recorded here>`). This is NetBird's
  built-in unattended-install preset — bypasses every prompt, uses the built-in Traefik reverse
  proxy, and enables the NetBird Proxy component (needed later for `netbird expose` / N4).
- **Result:** 4 containers running (`netbird-server`, `netbird-dashboard`, `netbird-traefik`,
  `netbird-proxy`), `https://netbird.4625labs.com` → `200`, valid Let's Encrypt cert
  (`CN=netbird.4625labs.com`, valid through Dec 25 2026). `dig @1.1.1.1` **run from VM-C itself**
  (not the venue network) confirms `netbird.4625labs.com`, `*.netbird.4625labs.com`, and
  `kettle.4625labs.com` all resolve to `144.202.22.122`.
- **Decided: keep `51820/udp` closed.** The installer publishes it for optional direct P2P proxy
  connections, but relay-only over 443/3478 is fine for our purposes and keeps the attack surface
  smaller. No firewall rule added for it (decision, not just a pending flag).
- **Not yet done:** no admin account exists on the dashboard yet. Per the plan, the user should
  create this themselves in-browser (never generated or seen by this agent) — see next report for
  exact first-login steps once relayed.

### 2026-09-26 — Admin account, Peer Expose, two services all created — but neither service works yet
- User confirmed: admin account works, Peers page shows `kettle-app` and `kettle-db`, Peer Expose
  is enabled, and both reverse-proxy services exist: `kettle.4625labs.com` → `kettle-app:3000`,
  `api.netbird.4625labs.com` → `kettle-db:8000`.
- Verification (from VM-C): `curl -sI https://kettle.4625labs.com` and `curl -s
  https://api.netbird.4625labs.com/auth/v1/health` — **both time out** (no response, not even a
  clean 502/401). DNS resolves correctly for both (`dig @1.1.1.1` → `144.202.22.122`).
- **Root cause found:** `netbird status` on **both VM-A and VM-B shows "Peers count: 0/1
  Connected"** — each VM is connected to Management/Signal fine, but has **no working
  peer-to-peer/relay connection to the other peer** (or to the proxy component's routing). The
  proxy's own logs (`docker logs netbird-proxy` on VM-C) show it repeatedly trying and failing to
  reach `kettle-db`'s NetBird IP (`100.75.132.16:8000`) — requests hang rather than failing
  cleanly, consistent with a broken/blocked overlay path, not just "nothing deployed yet."
- **Likely cause (not yet confirmed):** a missing or misconfigured Access Control policy in the
  NetBird dashboard. Self-hosted NetBird doesn't always ship a default "allow all peers" policy —
  if none exists (or a default-deny policy is in effect), peers can register with Management but
  never establish an actual data path to each other or to the proxy. This is dashboard/account
  configuration territory this agent doesn't have credentials for.
- **Needs from the user:** check **Access Control / Policies** in the dashboard — confirm a policy
  exists that allows the reverse-proxy service to reach `kettle-app`/`kettle-db` (and ideally that
  `kettle-app`/`kettle-db` can reach each other, for later VM-A ↔ VM-B traffic). If no policy
  exists, create one (a broad "Allow all peers" default policy is the simplest fix for now, suitable
  for a single-tenant demo like this).
- Ruled out as the cause: DNS (correct), the services themselves (both created correctly per the
  user), firewall (irrelevant — this is all internal NetBird overlay routing, not the Vultr cloud
  firewall).

### 2026-09-26 — User added an "All → All" Access Control policy — isolated the remaining gap
- After the policy was added: **direct peer-to-peer traffic now works.** From VM-A: `ping
  100.75.132.16` (VM-B) succeeds (0% loss), `curl http://100.75.132.16:8000/rest/v1/` → clean
  `401`. So the policy fixed peer ↔ peer.
- **But the two reverse-proxy services still time out** (retested with a 20s timeout, still
  nothing). Restarted the `netbird` client service on both VM-A and VM-B — no change.
  `netbird status` still reads "0/2 Connected" on both, but that now looks like a red herring
  (it's the idle "Lazy connection" counter, not a live traffic indicator — the ping/curl above
  prove traffic works despite it reading 0).
- **Isolated:** the gap is specifically **VM-C's reverse-proxy cluster → target peer**, not peer ↔
  peer. VM-C itself was never joined as a NetBird peer (`netbird up`) — it only runs the
  server/management/dashboard/proxy stack, so the reverse-proxy component likely uses a distinct
  network identity ("proxy cluster") to reach service targets, separate from the peer ACL that
  just started working.
- **Needs from the user, next:** check the **Services status column** (Reverse Proxy → Services)
  for both services — NetBird docs mention a `tunnel_not_created` status meaning exactly "the
  proxy cluster hasn't established a tunnel to the target" yet. If either shows that, try editing
  and re-saving the service (forces a resync) since the ACL policy was added *after* the services
  were created — the tunnel attempt may only trigger on create/edit, not automatically once a
  policy appears later. Also worth checking Access Control for anything explicitly naming a

### 2026-09-26 — Actual root cause: Docker hairpin NAT, not ACLs or ports
- `netbird-server` logs confirm both services are `status: active` with certs issued — server-side
  config is fine. The recurring failure is entirely inside the `netbird-proxy` container, looping
  every ~30-40s independent of any client request: `"error while connecting to the Signal Exchange
  Service netbird.4625labs.com:443: context canceled"`.
- Isolated with a raw TCP test: `docker exec netbird-proxy nc -zv -w 5 144.202.22.122 443` →
  **"Operation timed out"**. Internal Docker traffic (`nc netbird-server 80`) works instantly. The
  VM-C host itself (outside any container) reaches its own public IP fine.
- **This is the classic Docker hairpin-NAT limitation**: a container on the custom bridge network
  can't loop back through its own host's public IP the way an external client can. `netbird-proxy`
  reaches `netbird-server` for Management via an internal address (`http://netbird-server:80`,
  works fine) but reaches Signal/relay via its own **public domain**
  (`netbird.4625labs.com:443`) — which routes out and can't hairpin back in.
- **Has nothing to do with `51820/udp` or WireGuard** — in reverse-proxy mode, signal/relay/mgmt
  all multiplex over 443 (confirmed from NetBird's port-requirements doc), and that's exactly the
  connection that's failing here, at the plain TCP level, before any WireGuard handshake would even
  start. **No firewall change needed** — external clients (real judges/browsers) never touch this
  internal loopback path; peer-to-peer traffic already proved this via the ping/curl test above.
- **Proposed fix, awaiting approval:** add a Docker Compose `extra_hosts` entry on
  `netbird-proxy` mapping `netbird.4625labs.com` → `172.30.0.10` (Traefik's internal static IP in
  the netbird Docker network) so the proxy's internal client resolves its own domain straight to
  Traefik over the internal network instead of hairpinning through the internet. One line in
  `/root/docker-compose.yml` on VM-C + `docker compose up -d --no-deps netbird-proxy` — no port
  change, no data loss, touches only that one container.
  "proxy"/"gateway" source group, separate from the peer list.

## 4. Values

| Item | Value |
|---|---|
| VM-C public IP | `144.202.22.122` |
| VM-C private VPC IP | `10.10.0.5` |
| VM-A public / private IP | `64.177.51.161` / `10.10.0.3` |
| VM-B public / private IP | `96.30.205.155` / `10.10.0.4` |
| BigRock DNS records needed now | `A netbird.4625labs.com` → `144.202.22.122`; `CNAME *.netbird.4625labs.com` → `netbird.4625labs.com`; `CNAME kettle.4625labs.com` → `netbird.4625labs.com` (fallback `kettle.netbird.4625labs.com` if custom domain unsupported) |
| Dashboard URL | `https://netbird.4625labs.com` (live, no admin account yet) |
| VM-A peer name / IP | `kettle-app.netbird.selfhosted` / `100.75.158.87` (NetBird overlay) |
| VM-B peer name / IP | `kettle-db.netbird.selfhosted` / `100.75.132.16` (NetBird overlay) |
| `kettle.4625labs.com` service | not yet created |
| Supabase API service name/URL | not yet created — plan: `api.netbird.4625labs.com` → VM-B peer `:8000` (Envoy gateway, confirmed listening) |
| Auth method | not yet decided (SSO vs password) |
| Supabase gateway (VM-B) | `http://10.10.0.4:8000` — 11/11 containers healthy, confirmed reachable from VM-A over the VPC |
