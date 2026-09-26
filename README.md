# Kettle

> *A kettle is a flock of vultures circling together.*

Kettle is a flock of AI agents (**Sales**, **Procurement**, and **Finance**) that run an
enterprise's back office together on Vultr. They share one ledger, hand work to each other,
push back when something doesn't add up, and stop for a human on anything that moves money.
Every action is recorded in a live, auditable execution trail, not a static dashboard.

Vultr Agent Arena Hackathon 2026, Challenge 2 (Future of Work). Live at
`https://kettle.4625labs.com` (coming soon). Requirements: [`docs/REQUIREMENTS.md`](docs/REQUIREMENTS.md).

## Workflow

```
Deal (sales, won)
  -> Purchase Request (procurement need)
  -> Vendor Comparison + RFQ
  -> Purchase Order
  -> Invoice
  -> Reconciliation (match PO vs invoice, flag anomalies)
  -> Payment / follow-up
```

Every step is written to `agent_runs` / `agent_steps` as it happens. That trail is
the core UI: proof of real, executed work rather than a described one.

## Stack

- **Frontend/backend:** Next.js 16 (App Router, TypeScript, Tailwind) — `web/`
- **Data + auth:** Supabase, deployed via [Vultr's Supabase marketplace app](https://docs.vultr.com/how-to-deploy-a-nextjs-application-with-vultr-supabase-marketplace-app)
- **Agent reasoning:** [Vultr Serverless Inference](https://docs.vultr.com/products/serverless/inference/provisioning) (OpenAI-compatible, `web/src/lib/agent/inference.ts`)
- **Infra:** Vultr VM backend (mandatory per challenge rules); Vultr is the system of
  record/control, not just static hosting.

## Repo layout

```
web/                       Next.js app
  src/lib/supabase/        browser + server Supabase clients
  src/lib/agent/           inference client + execution-ledger helpers
  supabase/migrations/     ledger schema (companies, deals, purchase_requests,
                           vendor_quotes, purchase_orders, invoices, payments,
                           agent_runs, agent_steps)
  supabase/seed.sql        demo seed data
```

## Local setup

```bash
cd web
npm install
cp .env.example .env.local   # fill in Supabase + Vultr Inference credentials
npm run dev
```

Apply the schema to a Supabase project (local or hosted):

```bash
npx supabase db push --db-url "$SUPABASE_DB_URL"
# or, for local dev:
npx supabase start
npx supabase db reset   # applies migrations + seed.sql
```

## Vultr deployment

1. Redeem hackathon credits on the Vultr account (coupon emailed after opening ceremony).
2. Deploy the **Supabase marketplace app** on a Vultr VM ([guide](https://docs.vultr.com/how-to-deploy-a-nextjs-application-with-vultr-supabase-marketplace-app)) for Postgres/auth.
3. Deploy this Next.js app to a Vultr VM (same or separate instance).
4. Provision a Vultr Serverless Inference API key and point `VULTR_INFERENCE_API_KEY` /
   `VULTR_INFERENCE_BASE_URL` at it.
5. (Bonus) front the public URL with NetBird instead of opening inbound ports.

## Status

- [x] Repo scaffolded, ledger schema drafted, inference client stubbed
- [ ] Vultr VM + Supabase marketplace app provisioned
- [ ] Agent orchestration (sales -> procurement -> finance loop)
- [ ] Execution-trail UI
- [ ] Demo video + containment/anomaly moment
