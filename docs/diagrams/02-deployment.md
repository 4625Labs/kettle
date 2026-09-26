# Deployment

**Question:** What runs where on Vultr, and what's public?

```mermaid
flowchart TB
    classDef human fill:#FEF3C7,stroke:#D97706,color:#78350F
    classDef external fill:#FFFFFF,stroke:#9CA3AF,color:#374151,stroke-dasharray:4 3
    classDef vultr fill:#E0F2FE,stroke:#0284C7,color:#0C4A6E
    classDef danger fill:#FEE2E2,stroke:#DC2626,color:#7F1D1D

    INTERNET["Public internet"]:::external

    subgraph VMC["VM-C kettle-netbird — public 144.202.22.122 / vpc 10.10.0.5<br/>ONLY box with public inbound: 443/tcp, 80/tcp, 3478/udp"]
        TRAEFIK["Traefik (TLS termination)"]:::vultr
        NBSERVER["netbird-server: management + signal"]:::vultr
        NBDASH["netbird-dashboard (admin)"]:::vultr
        NBPROXY["netbird-proxy: reverse-proxy services"]:::vultr
        EXPOSE["netbird expose: per-run PIN URL (planned, N4)"]:::external
    end

    subgraph VMA["VM-A kettle-app — public 64.177.51.161 (no inbound) / vpc 10.10.0.3 / netbird 100.75.158.87"]
        WEB["web container: Next.js :3000<br/>bound to 127.0.0.1 + NetBird IP only"]:::vultr
        WORKER["worker container: agent job loop"]:::vultr
    end

    subgraph VMB["VM-B kettle-db — public 96.30.205.155 (no inbound) / vpc 10.10.0.4 / netbird 100.75.132.16"]
        GATEWAY["Envoy gateway :8000 (Supabase Kong replacement)"]:::vultr
        PG[("Postgres + Auth + Realtime + Storage<br/>migrations 0001-0007")]:::vultr
    end

    INTERNET -->|"https://kettle.4625labs.com (password/PIN, 401 until auth'd)"| TRAEFIK
    INTERNET -->|"https://api.netbird.4625labs.com (no NetBird auth; relies on Supabase keys/RLS)"| TRAEFIK
    TRAEFIK --> NBPROXY
    NBPROXY -->|"overlay to kettle-app:3000"| WEB
    NBPROXY -->|"overlay to kettle-db:8000"| GATEWAY
    NBPROXY -.-> EXPOSE

    WORKER -->|"VPC direct: http://10.10.0.4:8000"| GATEWAY
    GATEWAY --> PG
    WEB -.->|"chat + vision calls"| VULTRINF["Vultr Serverless Inference"]:::external
    WORKER -.->|"chat + vision calls"| VULTRINF
```

**How to read it:**
- VM-C is the only box with public firewall rules (`fw-kettle-netbird`: 80/tcp, 443/tcp, 3478/udp); VM-A and VM-B firewalls allow no public inbound at all — SSH to them only works VPC-side, jumped through VM-C.
- Two separate NetBird reverse-proxy services front the two private VMs: `kettle.4625labs.com` → `kettle-app:3000` (password-gated) and `api.netbird.4625labs.com` → `kettle-db:8000` (ungated; Supabase's own keys/RLS protect it).
- The worker never goes through NetBird to reach the database — it uses the VPC directly (`10.10.0.4:8000`), which is faster and keeps the reverse proxy off the hot path for every job.
- `netbird expose` (dashed, N4) is planned but not implemented: NetBird's Peer Expose is enabled and the `netbird-proxy` container is running, but the worker doesn't yet request per-run ephemeral URLs.
- Web and worker both call Vultr Serverless Inference directly over the internet (outbound only, no inbound port needed for this).

**Sources:** `infra/README.md`, `infra/NETBIRD.md`, `docs/STATUS.md` (VM table), `web/docker-compose.yml`, `web/src/lib/agent/db.ts` (`SUPABASE_URL` VPC precedence), `docs/REQUIREMENTS.md` N4.
