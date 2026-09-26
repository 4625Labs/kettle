# Request Path

**Question:** How does a browser request reach the app with zero open ports?

```mermaid
sequenceDiagram
    participant B as Browser (judge/user)
    participant T as Traefik (VM-C, public 443/tcp)
    participant P as netbird-proxy (VM-C)
    participant W as web:3000 (VM-A, no public port)
    participant G as Supabase gateway:8000 (VM-B, no public port)

    B->>T: GET https://kettle.4625labs.com
    T->>P: forward (reverse-proxy service "kettle-app")
    alt not yet authenticated to this NetBird service
        P-->>B: 401 + NetBird password/PIN form
        B->>P: submit password
    end
    P->>W: proxied over the NetBird overlay network (not the public internet)
    W->>W: proxy.ts (Next.js middleware): supabase.auth.getUser()
    alt no session and not a public route
        W-->>B: 302 redirect to /login
    else authenticated
        W-->>B: 200 app page (run view, approvals, deal page)
    end

    Note over B,G: The browser also talks to Supabase directly, for auth and realtime — same zero-port rule
    B->>T: GET/WS https://api.netbird.4625labs.com/auth/v1/... , /realtime/v1/...
    T->>P: forward (reverse-proxy service "kettle-db")
    P->>G: proxied over the NetBird overlay network
    G-->>B: session tokens / realtime step & handoff updates

    Note over W,G: The agent worker never uses this path — it reaches Supabase directly over the private VPC (10.10.0.4:8000), skipping NetBird entirely
```

**How to read it:**
- Only VM-C ever receives a public TCP connection; VM-A (the app) and VM-B (the database) have no listening public port at all.
- `kettle.4625labs.com` is gated by NetBird's own password/PIN screen (a `401` until solved) — that's the "human approval gate" in front of the Supabase login, not a replacement for it (N2).
- After NetBird auth, the request still has to pass Kettle's own Supabase session check in `proxy.ts`; the two logins are independent layers.
- The browser reaches Supabase's Auth and Realtime APIs the same way, via `api.netbird.4625labs.com` — never a direct port on VM-B (N3).
- The worker process is the one exception: it runs on VM-A and calls Supabase straight over the VPC (`SUPABASE_URL=http://10.10.0.4:8000`), because it doesn't need NetBird's public path at all.

**Sources:** `web/src/proxy.ts`, `infra/NETBIRD.md` (§3, §4), `infra/DEPLOYS.md`, `web/src/lib/agent/db.ts`, `docs/REQUIREMENTS.md` §7.7.
