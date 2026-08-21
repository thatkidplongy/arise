#!/usr/bin/env bash
#
# Install Arise's always-on services on THIS Mac.
#
# Fills the launchd templates in this folder with your paths and loads them:
#   • com.arise.backend — the API, always on (login + reboot + crash restart)
#   • com.arise.backup  — a daily database snapshot
#   • com.arise.digest  — the Recall digest email, 07:00 daily
#   • com.arise.deploy  — pulls main every 2 min, rebuilds the app if it changed
#
# Prerequisite: dependencies installed once with `cd backend && uv sync`.
# Re-run this any time (it reloads cleanly). Uninstall with ./uninstall.sh.
set -euo pipefail

BACKEND_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON="$BACKEND_DIR/.venv/bin/python"
AGENTS="$HOME/Library/LaunchAgents"
DOMAIN="gui/$(id -u)"

if [ ! -x "$PYTHON" ]; then
  echo "error: no virtualenv at $PYTHON" >&2
  echo "       run 'cd $BACKEND_DIR && uv sync' first." >&2
  exit 1
fi

mkdir -p "$AGENTS" "$BACKEND_DIR/logs" "$BACKEND_DIR/backups"

for label in com.arise.backend com.arise.backup com.arise.digest com.arise.deploy; do
  src="$BACKEND_DIR/deploy/$label.plist"
  dst="$AGENTS/$label.plist"
  sed -e "s#__BACKEND_DIR__#$BACKEND_DIR#g" -e "s#__PYTHON__#$PYTHON#g" "$src" >"$dst"
  # Unload any existing copy, then wait for it to fully deregister — bootstrapping
  # too soon returns "Input/output error".
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  for _ in 1 2 3 4 5 6; do
    launchctl print "$DOMAIN/$label" >/dev/null 2>&1 || break
    sleep 0.5
  done
  launchctl bootstrap "$DOMAIN" "$dst" || { sleep 1; launchctl bootstrap "$DOMAIN" "$dst"; }
  echo "loaded $label"
done

echo
echo "Done."
echo "  • API:     http://localhost:8000  (and http://<your-tailnet-ip>:8000)"
echo "  • Backups: $BACKEND_DIR/backups (daily, last 30 kept)"
echo "  • Digest:  07:00 daily (needs ARISE_RESEND_API_KEY + ARISE_DIGEST_TO in .env)"
echo "  • Deploy:  every 2 min — pulls main, rebuilds the app when it changed"
echo "  • Logs:    $BACKEND_DIR/logs/"
echo
echo "Next: install Tailscale on this Mac + your phone (see DEPLOY.md)."
echo "The web app builds itself from now on — com.arise.deploy just ran one."
