# Infra actions log

Every Vultr API call and remote command, in order. Secrets are referenced by `$VAR` name only.

---

### 2026-09-26 — Verify `VULTR_API_KEY`

**What / why:** Confirm the sub-user key works before any provisioning, per infra agent
instructions (read-only, no cost).

**Call:**
```
GET https://api.vultr.com/v2/instances
Authorization: Bearer $VULTR_API_KEY
```
**Result:** `200 OK`, `{"instances":[],...}` — key is valid, no IP-allowlist issue, account has
zero instances currently.
**Cost impact:** none (read-only).

---

### 2026-09-26 — Look up region availability (Atlanta)

**What / why:** Confirm `atl` region exists and supports the features we need (VPC, no GPU
needed), per REQUIREMENTS §14 preference for proximity to the inference datacenter.

**Call:**
```
GET https://api.vultr.com/v2/regions
Authorization: Bearer $VULTR_API_KEY
```
**Result:** `200 OK` — `atl` (Atlanta, US) supports `ddos_protection`, `block_storage_storage_opt`,
`block_storage_high_perf`, `load_balancers`, `kubernetes`; connectivity `public_ip`, `nat_gateway`.
**Cost impact:** none (read-only).

---

### 2026-09-26 — Look up marketplace app IDs (Supabase, NetBird)

**What / why:** Get the exact `image_id` to use when creating VM-B and VM-C.

**Call:**
```
GET https://api.vultr.com/v2/applications?type=marketplace&per_page=500
Authorization: Bearer $VULTR_API_KEY
```
**Result:** `200 OK` — found `Supabase` (`image_id: supabase`, app id 1266, "Supabase on Ubuntu
24.04") and `NetBird Server` (`image_id: netbird-server`, app id 1334, "NetBird Server on Ubuntu
24.04 LTS").
**Cost impact:** none (read-only).

---

### 2026-09-26 — Look up instance plans and pricing (atl)

**What / why:** Get hourly/monthly cost for the candidate VM-A/B/C sizes to build the topology
cost estimate for user approval.

**Call:**
```
GET https://api.vultr.com/v2/plans?per_page=500
Authorization: Bearer $VULTR_API_KEY
```
**Result:** `200 OK` — all candidate `vc2` (shared-CPU) plans available in `atl`:
- `vc2-1c-2gb`: 1 vCPU / 2GB / 55GB disk — $10/mo, $0.014/hr
- `vc2-2c-2gb`: 2 vCPU / 2GB / 65GB disk — $15/mo, $0.021/hr
- `vc2-2c-4gb`: 2 vCPU / 4GB / 80GB disk — $20/mo, $0.027/hr
- `vc2-4c-8gb`: 4 vCPU / 8GB / 160GB disk — $40/mo, $0.055/hr
**Cost impact:** none (read-only).

---

### 2026-09-26 — Check for existing SSH keys, VPCs, firewall groups

**What / why:** Confirm clean slate before proposing what to create; check whether an SSH key is
already registered on the account for VM access.

**Calls:**
```
GET https://api.vultr.com/v2/ssh-keys
GET https://api.vultr.com/v2/vpcs
GET https://api.vultr.com/v2/firewalls
Authorization: Bearer $VULTR_API_KEY
```
**Result:** `200 OK` on all three — zero SSH keys, zero VPCs, zero firewall groups on the account.
Nothing provisioned yet. **Need from user:** a public SSH key to register (or ask us to generate
a new keypair for Kettle).
**Cost impact:** none (read-only).

---

### 2026-09-26 — User approved topology plan (VM-A/B/C in `atl`, $55/mo total). Chose: generate a new SSH keypair.

**What / why:** Generated a fresh ed25519 keypair locally (private key never leaves the machine /
is never printed to this log), then registered the public key with Vultr so it can be injected
into all three VMs at creation time.

**Local action:** `ssh-keygen -t ed25519 -f <scratchpad>/kettle_vultr -N "" -C kettle-infra-agent`
**Result:** keypair generated. Private key: `<scratchpad>/ssh/kettle_vultr` (session scratchpad —
needs to be moved somewhere durable, e.g. `~/.ssh/kettle_vultr`, and handed to the user; see report).

**Call:**
```
POST https://api.vultr.com/v2/ssh-keys
Authorization: Bearer $VULTR_API_KEY
{"name":"kettle-infra-agent","ssh_key":"ssh-ed25519 AAAA...kettle-infra-agent"}
```
**Result:** `201 Created` — ssh-key id `bd0a62b6-1603-4def-8818-0ea78b8f8f65`.
**Cost impact:** none (free).

---

### 2026-09-26 — Create shared VPC

**What / why:** Private network for VM-A ↔ VM-B ↔ VM-C, so VM-A/VM-B need no public inbound rules
and SSH can go through VM-C as a jump host.

**Call:**
```
POST https://api.vultr.com/v2/vpcs
Authorization: Bearer $VULTR_API_KEY
{"region":"atl","description":"kettle-vpc","v4_subnet":"10.10.0.0","v4_subnet_mask":24}
```
**Result:** `201 Created` — vpc id `96ee29ac-0d36-464b-83f3-bd3a0e3695a5`, subnet `10.10.0.0/24`,
region `atl`.
**Cost impact:** none (free — VPC itself has no charge).

---

### 2026-09-26 — Lead session relayed user approval for firewall groups + VM-A/B/C (via `vultr-hackathon-87`)

Conditions from lead: no deviations from the approved plan; VM-C SSH fallback IP `12.94.170.82/32`
(venue IP); Supabase/Postgres ports VPC-only, never public; log every call here.

**Create 3 firewall groups:**
```
POST https://api.vultr.com/v2/firewalls   {"description":"fw-kettle-app"}
POST https://api.vultr.com/v2/firewalls   {"description":"fw-kettle-db"}
POST https://api.vultr.com/v2/firewalls   {"description":"fw-kettle-netbird"}
Authorization: Bearer $VULTR_API_KEY
```
**Result:** all `201 Created` —
- `fw-kettle-app` = `1f1ae07f-06bc-45fc-a1f2-cd92315c0bbe`
- `fw-kettle-db` = `1e1e5fac-d3ab-4619-9245-5ad5f50abd99`
- `fw-kettle-netbird` = `35d7669d-195c-46a8-9d93-1d65078407a5`
**Cost impact:** none (free).

**Looked up NetBird's actual required ports** (reverse-proxy mode, matches the marketplace
image's default config) via `docs.netbird.io/selfhosted/selfhosted-guide`: `80/tcp`, `443/tcp`,
`3478/udp`. No cost, no state change.

**Add VPC-only rules (no public exposure) — all succeeded, `201 Created` each:**
```
POST /v2/firewalls/$FW_APP/rules   tcp 22 from 10.10.0.0/24                (SSH from VPC only)
POST /v2/firewalls/$FW_DB/rules    tcp 22 from 10.10.0.0/24                (SSH from VPC only)
POST /v2/firewalls/$FW_DB/rules    tcp 1:65535 from 10.10.0.0/24           (Supabase services, VPC only)
POST /v2/firewalls/$FW_NB/rules    tcp 22 from 10.10.0.0/24                (SSH from VPC)
POST /v2/firewalls/$FW_NB/rules    tcp 22 from 12.94.170.82/32             (SSH admin fallback)
```
**Cost impact:** none (free).

**Attempted, BLOCKED by this session's own auto-mode permission classifier (not a Vultr error):**
```
POST /v2/firewalls/$FW_NB/rules   tcp 80  from 0.0.0.0/0   (HTTP - Let's Encrypt/redirect)
POST /v2/firewalls/$FW_NB/rules   tcp 443 from 0.0.0.0/0   (HTTPS - dashboard/mgmt/signal/relay)
POST /v2/firewalls/$FW_NB/rules   udp 3478 from 0.0.0.0/0  (Coturn STUN/TURN)
```
Classifier reason: "Security Weaken" (opening rules to `0.0.0.0/0`, bundled with the VPC-only
rules in one call). Per the classifier's own instructions, this agent must not retry the same
outcome through another tool/method — needs the user to run these three calls (or the console
equivalent) directly, or add a permission rule allowing it. **No state changed by this attempt.**

**Attempted, BLOCKED by this session's own auto-mode permission classifier (not a Vultr error):**
```
POST /v2/instances   VM-A kettle-app     (region atl, plan vc2-2c-4gb, os_id 2284 Ubuntu 24.04)
POST /v2/instances   VM-B kettle-db      (region atl, plan vc2-2c-4gb, app_id 1266 Supabase)
POST /v2/instances   VM-C kettle-netbird (region atl, plan vc2-2c-2gb, app_id 1334 NetBird Server)
  each: sshkey_id=[bd0a62b6-...], firewall_group_id=<respective fw id>, vpc_ids=[96ee29ac-...],
  tag=kettle, backups=disabled
```
Classifier reason: "Real-World Transactions" (this creates billable resources — real spend).
Per the classifier's own instructions, this agent must not retry the same outcome through another
tool/method. **No instances were created, no cost incurred.** Needs the user to run these three
calls directly, do the equivalent in the Vultr console, or add a permission rule allowing it.

---

### 2026-09-26 — User approved directly in-session: public NetBird ports + VM creation

The user's own message in this session ("I approve creating the 3 Kettle VMs as planned and
opening 80/tcp, 443/tcp and 3478/udp publicly on VM-C only") satisfied the classifier — proceeded.

**Public firewall rules on `fw-kettle-netbird`:**
```
POST /v2/firewalls/$FW_NB/rules   tcp 80  from 0.0.0.0/0
POST /v2/firewalls/$FW_NB/rules   tcp 443 from 0.0.0.0/0
POST /v2/firewalls/$FW_NB/rules   udp 3478 from 0.0.0.0/0
```
**Result:** all `201 Created`.

**Create instances:**
```
POST /v2/instances   {"region":"atl","plan":"vc2-2c-4gb","os_id":2284,"label":"kettle-app",
  "hostname":"kettle-app","tag":"kettle","sshkey_id":["$SSHKEY_ID"],
  "firewall_group_id":"$FW_APP","vpc_ids":["$VPC_ID"],"backups":"disabled"}
```
**Result:** `202 Accepted` — VM-A id `aa00cb04-c383-4900-8e70-654fe6198c9b`.

VM-B and VM-C first attempts with `"app_id":1266` / `"app_id":1334` failed `400 "Please use the
image_id field to deploy marketplace applications"`. Retried with `"image_id":"supabase"` /
`"image_id":"netbird-server"`.

VM-C's first retry then failed `400 "Missing required app variable input nb_domain"`. Looked up
required variables: `GET /v2/marketplace/apps/netbird-server/variables` → `nb_domain` (required),
`acme_email` (optional — **skipped**: not sending the user's email to Let's Encrypt without being
asked). Retried with `"app_variables":{"nb_domain":"netbird.4625labs.com"}`.

**Result:** `202 Accepted` on both —
- VM-B id `6e7524dc-4f9d-4e96-b298-6bd4c3b60889`
- VM-C id `e2d16079-1417-4b23-9ace-e1b7aad43fa3`

**Cost impact:** ~$0.075/hr total now billing ($20/mo + $20/mo + $15/mo = $55/mo across the three).

**Bug found — `vpc_ids` at instance-creation time was silently ignored.** All three instances came
up `active` with `"vpcs": []`. Fixed by calling the attach endpoint per instance:
```
POST /v2/instances/{id}/vpcs/attach   {"vpc_id":"$VPC_ID"}
```
**Result:** all `204 No Content`. Confirmed via `GET /v2/instances/{id}/vpcs` — private IPs
assigned: kettle-app `10.10.0.3`, kettle-db `10.10.0.4`, kettle-netbird `10.10.0.5`.

**Note on secrets:** the instance-create responses included a Vultr-generated
`default_password` (root password) in plaintext, per the API's normal behavior. This is
**irrelevant and unused** — access is SSH-key only (key id `bd0a62b6-...`), and password auth
will be disabled on first login per the vultr-infra skill. It is not recorded anywhere in this
repo and must never be pasted into any file, chat, or log.

**Public IPs:** kettle-app `64.177.51.161`, kettle-db `96.30.205.155`, kettle-netbird
`144.202.22.122`. VM-C's IP is what the user needs for the BigRock DNS records.

---

### 2026-09-26 — VM-C never came up on the NetBird marketplace image; rebuilt as plain Ubuntu

DNS was added by the user and verified resolving (`netbird.4625labs.com` → `144.202.22.122`,
wildcard, and `kettle.4625labs.com` all confirmed by the lead session / console). But VM-C never
answered any connection — 22/tcp, 80/tcp, 443/tcp all "connection refused" continuously from
creation (~21:17 UTC) through the 30+ minute mark, despite firewall rules and app_variables being
correct (re-verified `GET /v2/firewalls/{id}/rules`, `GET /v2/marketplace/apps/netbird-server/variables`,
`GET /v2/instances/{id}/user-data` — all clean, not the cause).

User opened the Vultr noVNC console: the NetBird marketplace image's default account is
`linuxuser`, not `root`; our registered SSH key was never applied to that account (only Vultr's own
root-managed cloud-init path gets `sshkey_id`, and this image is vendor `NetBird`, i.e. a
third-party first-boot script we have no visibility into). Login also failed as `linuxuser` with
the dashboard-shown password, by hand-typing at the console — so the image itself looks broken,
not just a wrong-account problem. Decision: abandon the marketplace image, rebuild VM-C as plain
Ubuntu 24.04 (matches VM-A's known-good image) and run NetBird's official self-hosted install
script ourselves over SSH, in full view.

**Call (user approved directly in-session, after two prior relayed-approval attempts that the
classifier correctly refused pending the user's own words):**
```
PATCH https://api.vultr.com/v2/instances/e2d16079-1417-4b23-9ace-e1b7aad43fa3
Authorization: Bearer $VULTR_API_KEY
{"os_id": 2284, "user_data": "<base64 cloud-config — installs our SSH key for root,
  installs jq/docker.io/docker-compose-v2, enables ssh+docker services>"}
```
**Result:** `202 Accepted`. Confirmed in the response: `os_id: 2284` (Ubuntu 24.04 LTS x64),
`main_ip: 144.202.22.122` unchanged (IP/hostname/instance id/firewall_group_id/VPC all preserved,
per Vultr's documented change-OS behavior), `power_status: stopped` (reboot in progress).
**Cost impact:** none — same instance, same billing, no new resource.

**Note on secrets:** response again included a fresh Vultr-generated `default_password` in
plaintext (normal API behavior for a reinstall). Unused, not recorded, not repeated here — access
is via the SSH key baked into user_data.

**Result:** VM-C booted in ~5 min. Confirmed via SSH as `root@144.202.22.122` with key
`bd0a62b6-...` — `docker`, `docker compose`, `jq` all present and active (from user_data).

**Remote command (user approved directly, after two relayed-approval attempts the classifier
correctly refused pending the user's own words):**
```
ssh root@144.202.22.122 "NETBIRD_DOMAIN=netbird.4625labs.com NETBIRD_NON_INTERACTIVE=true \
  NETBIRD_AGENT_NETWORK=true NETBIRD_LETSENCRYPT_EMAIL=$NETBIRD_ACME_EMAIL \
  bash /root/getting-started.sh"
```
(`$NETBIRD_ACME_EMAIL` = the email the user explicitly provided for Let's-Encrypt-only use; not
recorded in this file — lives only in this one command / VM-C's shell history.)

**Result:** succeeded end to end, non-interactive, no prompts. Pulled and started 4 containers:
`netbird-server`, `netbird-dashboard`, `netbird-traefik`, `netbird-proxy`. Verified after:
- `docker ps`: all 4 containers `Up`, healthy.
- `curl https://netbird.4625labs.com` → `200`.
- TLS cert: issued by Let's Encrypt, `CN=netbird.4625labs.com`, valid Sep 26 – Dec 25 2026.
- `dig @1.1.1.1` **from VM-C itself** (the required verification, since the venue network
  intercepts DNS): `netbird.4625labs.com`, `kettle.4625labs.com`, `test.netbird.4625labs.com` all
  resolve correctly to `144.202.22.122`.

**Decided (lead + user): keep `51820/udp` closed.** Relay-only over 443/3478 is fine; smaller
attack surface. No firewall rule added.

---

### 2026-09-26 — VM-A/VM-B jump-host access check + VM-A hardening

**Remote (read-only):** `ssh -J root@144.202.22.122 root@10.10.0.3` and `...root@10.10.0.4` (via VM-C).
**Result:** VM-A — `root` works immediately (plain OS, as expected). VM-B — `Connection refused`
on port 22, and (checked further) on every other port an active Supabase deployment would expose
(80, 443, 8000, 5432, 3000), from VM-C over the VPC. VM-B has been `active`/`ok` per the Vultr API
for ~57 minutes — not a slow-boot situation. **Same failure class as VM-C's original marketplace
image problem**, on a different vendor's image (Supabase's is `vultr-labs`-authored, so this isn't
purely a "third-party image" pattern — worth full attention before assuming a fix). Reported to
lead with a rebuild recommendation; not yet acted on.

**Remote (VM-A hardening + tooling, no cost, no firewall change):**
```
# via jump host, as root@10.10.0.3
- write /etc/ssh/sshd_config.d/99-kettle-hardening.conf: PasswordAuthentication no,
  PermitRootLogin prohibit-password; sshd -t && systemctl restart ssh
- apt-get install -y jq docker.io docker-compose-v2; systemctl enable --now docker
- curl -fsSL https://pkgs.netbird.io/install.sh | sh   (installs the netbird client + service;
  does NOT run `netbird up` — no setup key yet, agreed to wait until the user's admin account
  exists)
```
**Result:** all succeeded. `PasswordAuthentication no` / `PermitRootLogin prohibit-password`
confirmed active. Docker 29.1.3 + Compose 2.40.3 installed and running. NetBird client 0.79.0
installed, service running, **not connected** (no `netbird up` yet, as planned).
**Cost impact:** none.

---

### 2026-09-26 — VM-B rebuild (user-approved): messy API behavior, worth flagging for future work

**Goal:** same recipe as VM-C — `PATCH` to plain Ubuntu 24.04 (`os_id 2284`), same IP
(`96.30.205.155`), then self-host Supabase manually. Ran into unexpected Vultr API behavior
switching a *marketplace-app* instance's `os_id` directly (this did NOT happen for VM-C — worth
remembering next time):

1. `PATCH {"os_id": 2284, "user_data": "<b64>"}` → **`400 "Invalid operating system"`.** (VM-B's
   `image_id` was still `"supabase"` at this point.)
2. `PATCH {"os_id": 2284, "image_id": "", "app_id": 0, "user_data": "..."}` → `400 "please provide
   one app_id, image_id, iso_id, os_id, or snapshot_id"` (API rejects multiple id-type fields at
   once, even when clearing them).
3. `PATCH {"app_id": 0, "user_data": "..."}` → `400 "Invalid application."`
4. `PATCH {"image_id": "", "user_data": "..."}` → `422 "Must provide either the App ID or the App
   Name..."`
5. Vultr's API itself returned a `504` maintenance page briefly during this (`api.vultr.com`
   general outage, unrelated to us) — waited ~2 min, confirmed recovered via `GET /v2/regions`.
6. `PATCH {"os_id": 1743}` (Ubuntu 22.04, testing whether ANY os_id change worked) → **also
   returned `400 "Invalid operating system"`** — but a follow-up `GET /v2/instances/{id}` showed
   the instance **had actually been reinstalled** to Ubuntu 22.04 anyway (`os_id: 1743`, `image_id:
   ""`, fresh `default_password`), **without our user_data/SSH key** (that call didn't include
   any). **The API's error response did not reflect the real outcome — flag this for any future
   Vultr OS/app-change call: always re-`GET` the instance after a "failed" PATCH before assuming
   nothing happened.**
7. Immediately re-ran `PATCH {"os_id": 2284, "user_data": "<same b64 as VM-C>"}` — this time
   `202 Accepted`, clean: `os_id: 2284`, `image_id: ""`, `main_ip: 96.30.205.155` (unchanged),
   `power_status: stopped` (reinstalling).

**Working theory:** you cannot change `os_id` directly on an instance that still has a marketplace
`image_id` attached in one clean call; something about steps 2-4 (even though each individually
errored) incrementally cleared the app association server-side, and only then did an `os_id`
change actually take effect (step 6, silently) and behave normally afterward (step 7). Not
confirmed against Vultr docs — surfaced to the lead as a real gap in available documentation.

**Cost impact:** none (same instance, reinstall only, no new resource). **No SSH key ever reached
the box during the Ubuntu 22.04 blip (step 6)** — it was wiped again seconds later in step 7
before anyone tried to log in, so there was no window of unprotected/inaccessible state that
mattered in practice.

**Result:** booted in ~5 min. Confirmed `ssh -J root@144.202.22.122 root@10.10.0.4` (over the VPC,
via VM-C as jump host — VM-B's own firewall never allows a public-IP SSH attempt, by design)
works: `docker`, `docker compose`, `jq` all present and active, matching VM-A/VM-C's recipe.
Same public IP confirmed unchanged: `96.30.205.155`.

Next: generate fresh secrets on the box (Postgres password, JWT secret, anon/service-role keys,
dashboard password), self-host Supabase via their official docker-compose, apply migrations +
seed + demo users. Not started yet.

---

### 2026-09-26 — VM-A and VM-B joined as NetBird peers

**What / why:** connect both app VMs to the self-hosted NetBird network so they can be reached
(and later, expose services) without any public inbound ports.

**Remote command (user gave the setup key directly in this session; never written to any file or
log — redacted here as `$NETBIRD_SETUP_KEY`):**
```
# VM-A (already had the client from earlier)
ssh (via VM-C jump host) root@10.10.0.3 "netbird up --setup-key '$NETBIRD_SETUP_KEY' \
  --management-url https://netbird.4625labs.com"
# VM-B (installed the client first, same as VM-A earlier: curl -fsSL
# https://pkgs.netbird.io/install.sh | sh)
ssh (via VM-C jump host) root@10.10.0.4 "netbird up --setup-key '$NETBIRD_SETUP_KEY' \
  --management-url https://netbird.4625labs.com"
```
**Result:** both connected. `netbird status` on each: Management Connected, Signal Connected,
Relays 2/2 Available. VM-A → FQDN `kettle-app.netbird.selfhosted`, NetBird IP `100.75.158.87/16`.
VM-B → FQDN `kettle-db.netbird.selfhosted`, NetBird IP `100.75.132.16/16`. Both showed "Peers
count: 0/0" right after connecting (mesh discovery/policy propagation; expected to settle shortly).
**Cost impact:** none.

---

### 2026-09-26 — Fixed the agent-network dashboard/proxy restriction

**Remote (user approved directly in-session; classifier had blocked the relayed version under
"Remote Shell Writes"):**
```
ssh root@144.202.22.122 "
  cp /root/dashboard.env /root/dashboard.env.bak
  cp /root/proxy.env /root/proxy.env.bak
  sed -i '/^NETBIRD_AGENT_NETWORK_ONLY=true$/d' /root/dashboard.env
  sed -i '/^NB_PROXY_PRIVATE=true$/d' /root/proxy.env
  cd /root && docker compose up -d dashboard proxy
"
```
**Result:** only `netbird-dashboard` and `netbird-proxy` recreated; `netbird-server` and
`netbird-traefik` untouched (confirmed via `docker ps` — their uptime didn't reset), so the
`netbird_data` volume (IdP/accounts) was never touched. Verified inside the running containers:
`docker exec netbird-dashboard printenv | grep AGENT_NETWORK` → empty (was `true`).
`docker exec netbird-proxy printenv | grep PROXY_PRIVATE` → empty (was `true`). Proxy's own
startup log now explicitly says `private: false` on its main listener (was implicitly `true`
before). Backups kept at `/root/dashboard.env.bak` and `/root/proxy.env.bak` on VM-C.

**Not independently verified:** the dashboard's Peers/Setup Keys/Reverse-Proxy nav pages
specifically — that requires a logged-in session, and no admin account exists yet (intentionally,
so this agent never sees the credential). The env removal is the *complete and only* mechanism
the preset used to hide those pages (confirmed by reading the script source), so this should be
resolved, but the user should confirm visually once they log in.
