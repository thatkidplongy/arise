#!/usr/bin/env bash
# PostToolUse hook: lint the file that was just written or edited.
#
# eslint.config.js encodes the checkable rules from ~/Develop/CLAUDE.md and
# ~/Develop/FRONTEND_STANDARDS.md — file-size ceiling, no explicit any, no nested
# ternaries, underscore-prefixed unused args. Those rules only help if someone runs
# them, and "someone remembered" is exactly how they drifted in the first place.
# This delivers them at the moment of the edit instead.
#
# Never blocks. It reports through additionalContext so the finding lands in the
# model's context, because plain stdout from a successful hook isn't surfaced.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // .tool_response.filePath // empty')

# Only this project's own source. Tests, configs and everything outside src/ are
# linted by the full run, not on every keystroke.
case "$file" in
  */src/*.ts | */src/*.tsx) ;;
  *) exit 0 ;;
esac
[ -f "$file" ] || exit 0

root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
# --no-install: use the eslint in this repo, never fetch one mid-edit.
out=$(cd "$root" && npx --no-install eslint "$file" 2>&1) || true
[ -z "$out" ] && exit 0

jq -n --arg o "$out" '{
  hookSpecificOutput: {
    hookEventName: "PostToolUse",
    additionalContext: ("eslint on the file just edited — these encode the standards in ~/Develop:\n" + $o)
  }
}'
