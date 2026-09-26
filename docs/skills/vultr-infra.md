---
name: kettle-vultr-infra
description: Provision and manage Kettle's Vultr infrastructure — cloud compute VMs, VPC, firewall groups, Supabase and NetBird marketplace apps, and Serverless Inference — safely and within the $200 credit.
---

# Skill: Vultr infrastructure

## Target topology (see `docs/REQUIREMENTS.md` §14)
- **VM-A** `kettle-app`: Ubuntu LTS, 2 vCPU / 4 GB. Docker Compose (app + worker) + NetBird client. Firewall: **no inbound rules**.
- **VM-B** `kettle-db`: Vultr **Supabase** marketplace app, ≥ 4 GB. Reachable from VM-A over the VPC only.
- **VM-C** `kettle-netbird`: Vultr **NetBird** marketplace app, shared CPU ≥ 2 GB. Public 443/80 + NetBird relay ports.
- All three in the **same region** (prefer one close to the inference datacenter, `atl`) and attached to one **VPC**.

## Access
- API: `VULTR_API_KEY` only (sub-user `kettle-agent@4625labs.com`: provisioning, subscriptions, firewall). Never `VULTR_ADMIN_KEY`.
- Admin SSH: laptop → VM-C (public) → VM-A/VM-B over the VPC (`ProxyJump`). VM-A/VM-B firewall: SSH from the VPC subnet only; no public inbound rules.
- Log every API call and remote command to `infra/ACTIONS.md`, and report to the user after each step.

## Safety rules (non-negotiable)
- **Ask the user before** creating, resizing, or destroying any billable resource, and before changing firewall rules. Show the exact command or API call and its estimated monthly cost first.
- Never print, log, or commit API keys, root passwords, or `.env` contents. Refer to them by variable name.
- Prefer SSH keys; disable password root login after first boot.
- Tag every resource `kettle` so cleanup is easy.

## Tools
- Vultr API v2 (`https://api.vultr.com/v2`, `Authorization: Bearer $VULTR_API_KEY`) or `vultr-cli`. Console is fine for one-off marketplace installs — then document what was clicked.
- Marketplace guides:
  - Supabase: https://docs.vultr.com/how-to-deploy-a-nextjs-application-with-vultr-supabase-marketplace-app
  - NetBird: https://docs.netbird.io/selfhosted/marketplaces/vultr
- Serverless Inference: https://docs.vultr.com/products/serverless/inference/provisioning

## Deliverables
- `infra/README.md`: every resource, its purpose, region, plan, IPs (private/public), and how it was created.
- `infra/scripts/` idempotent scripts for anything repeatable (firewall rules, VM bootstrap).
- `infra/env.example`: every variable the deployment needs (names only).

## Verify
- From your laptop: VM-A has **no** reachable ports (`nc -zv <ip> 22 80 443 3000` all fail once NetBird SSH/access is in place).
- VM-A → VM-B over the private IP works; VM-B public ports closed except what the marketplace requires during setup.
- Credit burn check: list resources and their hourly cost; total must fit the remaining credit through Sunday 5 PM.
