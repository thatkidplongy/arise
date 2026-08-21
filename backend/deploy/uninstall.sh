#!/usr/bin/env bash
# Remove Arise's always-on services from this Mac. Your database is left alone.
set -euo pipefail

AGENTS="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"

for label in com.arise.backend com.arise.backup com.arise.digest com.arise.deploy; do
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  rm -f "$AGENTS/$label.plist"
  echo "removed $label"
done
echo "Done. (Your data in backend/arise.db and backups/ was not touched.)"
