---
name: kettle-nextjs-16
description: Build Kettle's Next.js 16 App Router code (pages, route handlers, server actions, auth-aware server components) without relying on outdated Next.js knowledge.
---

# Skill: Next.js 16 (App Router, TypeScript)

You are writing code for Kettle's web app in `web/`. It runs **Next.js 16.3.x**, which has
breaking changes versus most training data.

## Before writing any Next.js code
1. Read the relevant guide in `web/node_modules/next/dist/docs/` (`01-app/...`). Do not guess APIs.
2. Heed deprecation notices in those docs and in `next dev` output.
3. If the docs contradict what you "know", the docs win.

## Known differences to respect
- `params` and `searchParams` are **Promises** — `const { id } = await ctx.params`.
- `cookies()` and `headers()` are **async**.
- Type route handler context with the global `RouteContext<'/path/[id]'>` helper.
- Route handlers (`app/**/route.ts`) are **not cached** by default; no `route.ts` next to a `page.tsx` at the same segment.
- Server Actions dispatch **sequentially** per client — don't `Promise.all` them from the client.
- Treat every Server Action as a public POST endpoint: authenticate, authorize, validate input, return only what the UI needs.
- Session-refresh middleware: check the docs for the current file convention (it may no longer be `middleware.ts`) before adding Supabase auth refresh.

## Kettle conventions
- `src/app/` routes; `src/lib/` shared code; `@/*` import alias.
- Server-only code that uses `SUPABASE_SERVICE_ROLE_KEY` or `VULTR_INFERENCE_API_KEY` must never be imported by a client component. Add `import "server-only"` to such modules.
- Long-running agent work does **not** run inside a request — enqueue a job and return. The worker (`web/worker/`) does the work.
- Tailwind for styling; no new UI framework without asking the lead.
- Default to Server Components; use `"use client"` only for interactivity and Supabase Realtime subscriptions.

## Verify before you hand off
- `npx tsc --noEmit` passes
- `npm run lint` passes
- `npm run build` passes
- You loaded the page in a browser (or via `curl`) and the golden path works
