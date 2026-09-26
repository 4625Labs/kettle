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
| Peer Expose enabled (account setting) | todo |
| `kettle.4625labs.com` service active | todo |
| Auth configured (SSO/password gating the service) | todo |
| Supabase API service active | todo |
| VM-A port scan clean (no public ports) | todo |
| Per-run `netbird expose` working and expiring | todo |

Overall: **5/11 done** (VM-C created, DNS verified, dashboard + admin working, VM-A peer, VM-B
peer). Next: Peer Expose, the two reverse-proxy services, auth.

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
| Supabase API service name/URL | not yet created |
| Auth method | not yet decided (SSO vs password) |
