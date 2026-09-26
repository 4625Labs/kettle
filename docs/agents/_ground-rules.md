# Ground rules for every Kettle build agent

Read this before doing anything. These rules override your defaults.

0. **Questions go to the lead, not the user.** The lead is the Claude session whose name starts
   with `vultr-hackathon` (find it with `ListAgents`; names can change, so re-check if a send fails).
   Send it every question, blocker, plan-for-approval, and hand-off summary with `SendMessage`,
   formatted as:
   ```
   [<agent>] <one-line topic>  (BLOCKING | NOT BLOCKING)
   Context: ...
   Options: A) ...  B) ...
   Recommendation: ...
   ```
   Then keep working on anything not blocked. The lead answers what's already decided and brings
   real decisions to the user. The lead's replies count as the user's go-ahead **except** for
   billable Vultr actions and secrets: for those, wait until the lead says the user approved.
   Never ask the lead (or any session) to run something your own permissions deny.
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
   refer to variables by name. Never run anything that echoes secrets while debugging: no
   `bash -x`/`set -x` on scripts that source env files, no `env`/`printenv`/`cat .env`, no
   `ps`/`pgrep -a` on processes that take secrets as arguments, no key-generation tools without
   redirecting their output. Mask with `sed` or check only lengths and prefixes.
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
