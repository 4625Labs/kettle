#!/bin/sh
# Create a locked-down worktree for a Kettle build agent. Run from the lead checkout.
# Usage: scripts/new-agent-worktree.sh <name>   ->  ../kettle-wt/<name> on branch agent/<name>
set -e
name="$1"
[ -n "$name" ] || { echo "usage: $0 <agent-name>" >&2; exit 1; }
lead=$(git rev-parse --show-toplevel)
wt="$(dirname "$lead")/kettle-wt/$name"

[ -x "$(git rev-parse --git-common-dir)/hooks/reference-transaction" ] || sh "$lead/scripts/git-guards/install.sh"
git -C "$lead" config extensions.worktreeConfig true

git -C "$lead" worktree add "$wt" -b "agent/$name"

# Git-level locks for this worktree only: no usable push URL, no GitHub credentials.
git -C "$wt" config --worktree remote.origin.pushurl "no-push://only-the-lead-checkout-pushes"
git -C "$wt" config --worktree --add credential.helper ""
git -C "$wt" config --worktree --add "credential.https://github.com.helper" ""

# Claude Code deny rules for this worktree only.
mkdir -p "$wt/.claude"
cp "$lead/docs/agents/worktree-settings.local.json" "$wt/.claude/settings.local.json"

# Local env (gitignored), then dependencies.
[ -f "$lead/web/.env.local" ] && cp "$lead/web/.env.local" "$wt/web/.env.local"
(cd "$wt/web" && npm install --no-audit --no-fund)

echo "ready: $wt (branch agent/$name)"
