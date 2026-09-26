#!/bin/sh
# Install Kettle's git guards into the shared hooks dir (applies to every worktree). Run from the lead checkout.
set -e
root=$(git rev-parse --show-toplevel)
hooks=$(git rev-parse --git-common-dir)/hooks
for h in pre-push reference-transaction; do
  cp "$root/scripts/git-guards/$h" "$hooks/$h"
  chmod 755 "$hooks/$h"
done
echo "installed guards in $hooks"
