# Kettle infrastructure

Everything here is provisioned on Vultr, region **`atl`** (Atlanta), tagged `kettle`. Full call-by-call
log (every API request and remote command, in order) is in [`ACTIONS.md`](./ACTIONS.md). NetBird
setup status is tracked separately in [`NETBIRD.md`](./NETBIRD.md) — that's the single place to
check zero-port bonus progress.

## Resources

| Resource | ID | Notes |
|---|---|---|
| VPC `kettle-vpc` | `96ee29ac-0d36-464b-83f3-bd3a0e3695a5` | `10.10.0.0/24`, region `atl` |
| SSH key `kettle-infra-agent` | `bd0a62b6-1603-4def-8818-0ea78b8f8f65` | ed25519, generated for this project; private key held by the user, not in this repo |
| Firewall group `fw-kettle-app` | `1f1ae07f-06bc-45fc-a1f2-cd92315c0bbe` | SSH (22/tcp) from `10.10.0.0/24` only. No public inbound. |
| Firewall group `fw-kettle-db` | `1e1e5fac-d3ab-4619-9245-5ad5f50abd99` | SSH (22/tcp) + all TCP from `10.10.0.0/24` only (Supabase's internal services — kong, postgres, studio, auth, realtime, storage). No public inbound. |
| Firewall group `fw-kettle-netbird` | `35d7669d-195c-46a8-9d93-1d65078407a5` | Public `80/tcp`, `443/tcp`, `3478/udp` (NetBird reverse-proxy + STUN/TURN); SSH from `10.10.0.0/24` and the admin's current IP as a fallback |

| VM | Vultr instance ID | Plan | Public IP | Private (VPC) IP | Role |
|---|---|---|---|---|---|
| **VM-A** `kettle-app` | `aa00cb04-c383-4900-8e70-654fe6198c9b` | `vc2-2c-4gb` (2 vCPU / 4GB) | `64.177.51.161` | `10.10.0.3` | Next.js app + agent worker, Docker Compose, NetBird client. Zero public inbound ports. |
| **VM-B** `kettle-db` | `6e7524dc-4f9d-4e96-b298-6bd4c3b60889` | `vc2-2c-4gb` (2 vCPU / 4GB) | `96.30.205.155` | `10.10.0.4` | Supabase marketplace app (Postgres, Auth, Realtime, Storage). Reachable from VM-A over the VPC only. |
| **VM-C** `kettle-netbird` | `e2d16079-1417-4b23-9ace-e1b7aad43fa3` | `vc2-2c-2gb` (2 vCPU / 2GB) | `144.202.22.122` | `10.10.0.5` | Self-hosted NetBird (management + reverse proxy). The only box with public inbound rules. |

**Cost:** $55/mo combined ($20 + $20 + $15), $0.075/hr. VPC and firewall groups are free. Well
inside the $200 hackathon credit for the event's duration.

## How it was created

All via the Vultr API v2 (`https://api.vultr.com/v2`), authenticated with `$VULTR_API_KEY` (a
scoped sub-user key — provisioning/subscriptions/firewall ACLs only, no billing/DNS/users). Order:

1. Verified the key with a read-only `GET /v2/instances`.
2. Looked up region (`atl`), marketplace app image ids (`supabase`, `netbird-server`), and instance
   plan pricing for `atl`.
3. Generated a new ed25519 SSH keypair locally and registered the public half via
   `POST /v2/ssh-keys`.
4. Created the VPC via `POST /v2/vpcs`.
5. Created the three firewall groups (`POST /v2/firewalls`) and their rules
   (`POST /v2/firewalls/{id}/rules`) — VPC-only rules first, then (after explicit user approval)
   the public NetBird ports on `fw-kettle-netbird`.
6. Created the three instances via `POST /v2/instances`, each with `sshkey_id`, `firewall_group_id`,
   and (intended) `vpc_ids` set.
7. **Gotcha:** `vpc_ids` passed at instance-creation time was silently ignored — all three
   instances came up with `"vpcs": []`. Fixed by attaching the VPC after creation, per instance:
   `POST /v2/instances/{id}/vpcs/attach` with `{"vpc_id": "<vpc id>"}` (`204 No Content`), confirmed
   via `GET /v2/instances/{id}/vpcs`. **If you create more Vultr instances via the API and need
   them on the VPC, attach the VPC after creation, not at creation time.**
8. VM-C (NetBird Server marketplace app) additionally required an app variable:
   `POST /v2/instances` with `"image_id":"netbird-server"` fails without
   `"app_variables":{"nb_domain":"netbird.4625labs.com"}` (check
   `GET /v2/marketplace/apps/{image_id}/variables` for any marketplace app before deploying it).

Full request/response detail (with secrets replaced by `$VAR` names) is in `ACTIONS.md`.

## Access

No NetBird client and no admin tooling on the developer's laptop. SSH reaches VM-A/VM-B through
VM-C as a jump host over the VPC (VM-A/VM-B firewalls only allow SSH from `10.10.0.0/24`):

```
ssh -J root@144.202.22.122 root@10.10.0.3   # VM-A
ssh -J root@144.202.22.122 root@10.10.0.4   # VM-B
```

Suggested `~/.ssh/config` entries (see `docs/skills/deploy-to-vultr.md`):

```
Host kettle-netbird
  HostName 144.202.22.122
  User root
  IdentityFile ~/.ssh/kettle_vultr

Host kettle-app
  HostName 10.10.0.3
  User root
  ProxyJump kettle-netbird
  IdentityFile ~/.ssh/kettle_vultr

Host kettle-db
  HostName 10.10.0.4
  User root
  ProxyJump kettle-netbird
  IdentityFile ~/.ssh/kettle_vultr
```

Vultr's default root password (returned once at instance-creation time) is unused — access is
SSH-key only, and password auth should be disabled on first login.

## Deploy

See [`../docs/skills/deploy-to-vultr.md`](../docs/skills/deploy-to-vultr.md) for the repeatable
deploy flow, and [`DEPLOYS.md`](./DEPLOYS.md) for the log of actual deploys run.

## Environment variables

See [`env.example`](./env.example) for every variable the deployment needs (names only — real
values live in `/opt/kettle/.env` on VM-A, 600 perms, never in git).
