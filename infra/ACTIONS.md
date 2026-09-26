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
