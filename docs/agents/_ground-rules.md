# Ground rules for every Kettle build agent

Read this before doing anything. These rules override your defaults.

1. **Confirm before building.** First reply with a short plan (files you'll create/change, order,
   open questions). Wait for the user's "go" before writing code.
2. **Local git only.** Commit to your own branch in your own worktree. **Never** `git push`,
   never create a GitHub repo, never open PRs. The lead session reviews and merges locally.
   This is enforced by git hooks and permission rules. If a command is denied, don't look for a
   workaround; say what you needed in your summary.
3. **Stay in your lane.** Only edit files your prompt says you own. If you need a change elsewhere,
   stop and describe it in your summary for the lead. `web/package.json` / lockfile: add
   dependencies only when necessary, and list them in your summary.
4. **Secrets.** Never print, commit, or paste keys/passwords. Use `web/.env.local` (gitignored) and
   refer to variables by name.
5. **Billable or destructive actions** (creating VMs, firewall changes, deleting data, running
   migrations against Vultr): show the exact command and ask first. Every time.
6. **Next.js 16** is newer than your training data: read `web/node_modules/next/dist/docs/`
   before writing Next.js code (see `docs/skills/nextjs-16.md`).
7. **Source of truth:** `docs/REQUIREMENTS.md` (requirement IDs like F2, K4). Reference IDs in
   commit messages. Don't add features outside your assigned IDs.
8. **Done means verified:** type-check, lint, build, and actually run what you built. Say what you
   could not verify.
9. **Hand-off summary** when finished: what you built (by requirement ID), how to run/test it,
   files touched outside your lane (should be none), new deps, known gaps, and what the next agent
   needs to know.
