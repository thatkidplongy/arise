#!/usr/bin/env bash
#
# Pull main, rebuild only what changed, restart only if needed.
#
# Run by hand any time, or on a timer by the com.arise.deploy launchd job. The
# whole point is that a code change reaches the phone without anyone remembering
# to run build-web.sh: dist/ is gitignored, so a `git pull` alone never updates
# the UI, and the stale bundle is indistinguishable from a bug.
#
# Safe to run every few minutes: with no new commit it does one `git fetch` and
# stops. The expensive export happens only when the frontend actually moved.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BRANCH="${ARISE_DEPLOY_BRANCH:-main}"
STAMP="dist/.built-from"   # the commit dist/ was built from; gitignored with dist/
LABEL="com.arise.backend"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERROR: $*"; exit 1; }

# launchd hands a job a bare PATH (/usr/bin:/bin:/usr/sbin:/sbin), so node, npx
# and uv — installed by Homebrew or nvm — are invisible unless we go looking.
# Checked in order; a user-managed nvm install wins over a system one.
for extra in \
  "$HOME/.nvm/versions/node/"*/bin \
  "$HOME/.local/bin" \
  /opt/homebrew/bin \
  /usr/local/bin
do
  [ -d "$extra" ] && PATH="$extra:$PATH"
done
export PATH

command -v git >/dev/null || die "git not found in PATH"

# One at a time. launchd already won't run two copies of the job, but running
# this by hand while the timer fires would have two exports fighting over
# dist.new. mkdir is the atomic test-and-set every POSIX filesystem gives us.
LOCK="$ROOT/.deploy.lock"
if ! mkdir "$LOCK" 2>/dev/null; then
  # A crashed run would otherwise wedge every future one, so age out a stale lock.
  if [ -n "$(find "$LOCK" -maxdepth 0 -mmin +60 2>/dev/null)" ]; then
    log "clearing a stale lock (older than an hour)"
    rm -rf "$LOCK"
    mkdir "$LOCK" 2>/dev/null || { log "another deploy is running — skipping"; exit 0; }
  else
    log "another deploy is running — skipping"
    exit 0
  fi
fi
trap 'rm -rf "$LOCK"' EXIT

# ── 1. Refuse to touch a dirty tree ──────────────────────────────────────────
# A pull here could clobber uncommitted work, and an unattended job is exactly
# the wrong place to be resolving that. Say so and leave it alone.
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  log "working tree has uncommitted changes — skipping (nothing was touched)"
  exit 0
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
if [ "$CURRENT_BRANCH" != "$BRANCH" ]; then
  log "on '$CURRENT_BRANCH', not '$BRANCH' — skipping (nothing was touched)"
  exit 0
fi

# ── 2. Fast-forward to origin ────────────────────────────────────────────────
OLD="$(git rev-parse HEAD)"
git fetch --quiet origin "$BRANCH" || die "git fetch failed (no network, or no stored credential for this repo)"

# --ff-only so this can never invent a merge commit or rewrite anything. If the
# local branch has diverged, that needs a human.
if ! git merge --ff-only --quiet "origin/$BRANCH" 2>/dev/null; then
  log "cannot fast-forward to origin/$BRANCH — local branch has diverged. Skipping."
  exit 0
fi
NEW="$(git rev-parse HEAD)"

[ "$OLD" != "$NEW" ] && log "pulled ${OLD:0:7} → ${NEW:0:7}" || log "already at ${NEW:0:7}"

# ── 3. Work out what actually needs doing ────────────────────────────────────
BUILT_FROM=""
[ -f "$STAMP" ] && BUILT_FROM="$(cat "$STAMP")"

need_build=0
need_restart=0

if [ ! -d dist ] || [ ! -f dist/index.html ]; then
  log "no build present"
  need_build=1
elif [ "$BUILT_FROM" != "$NEW" ]; then
  # dist/ was built from some other commit (or by hand, with no stamp). Rebuild
  # only when something the bundle is made of actually changed between the two.
  if [ -z "$BUILT_FROM" ] || ! git cat-file -e "$BUILT_FROM^{commit}" 2>/dev/null; then
    log "build is unstamped or from an unknown commit"
    need_build=1
  elif git diff --name-only "$BUILT_FROM" "$NEW" -- \
        src assets app.json package.json package-lock.json tsconfig.json \
        scripts/build-web.sh | grep -q .; then
    log "frontend changed since ${BUILT_FROM:0:7}"
    need_build=1
  else
    # Backend-only commits don't change the bundle; just re-stamp so we don't
    # re-check this same range every run.
    echo "$NEW" >"$STAMP"
    log "no frontend change — build left alone"
  fi
fi

if [ "$OLD" != "$NEW" ]; then
  if git diff --name-only "$OLD" "$NEW" -- backend | grep -q .; then
    log "backend changed"
    need_restart=1
  fi
  # Dependency changes need a sync before the service comes back up.
  if git diff --name-only "$OLD" "$NEW" -- backend/pyproject.toml backend/uv.lock | grep -q .; then
    if command -v uv >/dev/null; then
      log "python deps changed — uv sync"
      (cd backend && uv sync --quiet) || die "uv sync failed — leaving the running service alone"
    else
      log "WARNING: deps changed but uv is not in PATH; skipping sync"
    fi
  fi
fi

# ── 4. Build ─────────────────────────────────────────────────────────────────
if [ "$need_build" = 1 ]; then
  command -v npx >/dev/null || die "npx not found in PATH — install Node, or add its bin dir to this script's PATH list"
  log "building the web app…"
  # Build beside the live one, not over it. The export takes minutes and the
  # backend reads dist/ per request, so building in place would serve the phone a
  # half-written app the whole time — and leave it broken if the build failed.
  rm -rf dist.new dist.old
  if ! ARISE_WEB_OUT=dist.new ./scripts/build-web.sh >/dev/null 2>&1; then
    rm -rf dist.new
    die "build failed — the previous build is untouched and still being served"
  fi
  echo "$NEW" >"dist.new/.built-from"
  # Two renames rather than a delete-then-move, so the gap where dist/ doesn't
  # exist is a syscall wide instead of a file-copy wide.
  [ -d dist ] && mv dist dist.old
  mv dist.new dist
  rm -rf dist.old
  log "built ${NEW:0:7}"
  need_restart=1
fi

# ── 5. Restart ───────────────────────────────────────────────────────────────
# The backend holds dist/ open through a StaticFiles mount resolved at startup,
# so a new build isn't served until it comes back up.
if [ "$need_restart" = 1 ]; then
  if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
    launchctl kickstart -k "gui/$(id -u)/$LABEL"
    log "restarted $LABEL"
  else
    log "WARNING: $LABEL is not loaded — nothing to restart (run backend/deploy/install.sh)"
  fi
else
  log "nothing to do"
fi
