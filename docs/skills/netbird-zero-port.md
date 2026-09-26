---
name: kettle-netbird-zero-port
description: Serve Kettle through a self-hosted NetBird reverse proxy on Vultr with zero inbound ports on the app VM, gated access, and lifecycle-bound per-run URLs — the NetBird bonus challenge.
---

# Skill: NetBird zero-port access

Docs (read these first — the feature is **beta** and changes):
- Reverse proxy: https://docs.netbird.io/manage/reverse-proxy
- Expose from CLI: https://docs.netbird.io/manage/reverse-proxy/expose-from-cli
- Vultr marketplace: https://docs.netbird.io/selfhosted/marketplaces/vultr

## Bonus scoring checklist
1. **No open ports** — public demo URL served through NetBird; no inbound app ports on VM-A.
2. **Gated access** — SSO, password, PIN, or header auth, matched to a real user role.
3. **Lifecycle-bound URLs** — provisioned per task/session and expire with the workload.

## Setup
1. **DNS (BigRock, added by the user):** `A netbird.4625labs.com` → VM-C public IP; `CNAME *.netbird.4625labs.com` → `netbird.4625labs.com`; `CNAME kettle.4625labs.com` → `netbird.4625labs.com`. Verify with `dig @1.1.1.1` from a Vultr VM (the venue network intercepts DNS). The developer's laptop is **not** a NetBird peer.
2. **VM-C:** deploy the Vultr NetBird marketplace app (shared CPU ≥ 2 GB). It ships Traefik (TLS), the reverse proxy (enabled by default), CrowdSec, and a local admin store. Open `https://netbird.<domain>`, create the admin.
3. **VM-A:** install the NetBird client, `netbird up` with a setup key, confirm the peer appears.
4. **VM-B (Supabase):** also a peer, so its API can be exposed without a public port.
5. **Account settings:** enable **Peer Expose** (required for `netbird expose`).

## Services
- **Persistent app service** (dashboard → Reverse Proxy → Services → Add Service): HTTP mode, custom domain `kettle.4625labs.com` (fallback subdomain `kettle` → `kettle.netbird.4625labs.com`), target VM-A peer port 3000, auth = SSO (user groups) or password. This is the demo URL.
- **Supabase API service**: HTTP, target VM-B peer on the Supabase gateway port, so browser Auth/Realtime work with no public DB ports. Header auth is not appropriate here (the browser must reach it); rely on Supabase keys + RLS.
- **Per-run lifecycle URL (N4):** the worker spawns
  `netbird expose <port> --with-pin <pin> --with-name-prefix run-<shortid>`
  as a child process when a run needs an external party (e.g. vendor portal or approver page), records the URL + PIN on the run, and kills the process when the run ends. Sessions have a 90 s TTL renewed every 30 s while the command runs, max **10 per peer**.

## Gotchas
- Don't create an HTTP and a TLS service with the same hostname.
- L4 (tcp/udp) services get no browser auth — use HTTP mode for anything humans open.
- Rosenpass is unsupported with the reverse proxy.
- Status must reach `active`; `certificate_failed` almost always means DNS or port 443/80 on VM-C.

## Verify
- `nmap`/`nc` from outside: VM-A shows no open ports; the app still loads at `https://kettle.4625labs.com` after the auth prompt.
- Start a run → per-run URL appears and works with its PIN → run completes → URL stops resolving within ~90 s.
