# Running Arise for real (free, single-user)

The setup: the backend runs **always-on on your Mac** as a launchd service, and
**Tailscale** privately connects your phone to it from anywhere. Your progress
lives in `backend/arise.db` on your Mac. Total cost: $0, forever.

## What you set up on your machine

Everything below is machine-specific — the repo ships **templates**, and the
install script fills in your paths. You provide:

| Thing | How | Where it's used |
|---|---|---|
| Python deps | `cd backend && uv sync` | creates `backend/.venv` |
| Always-on services | `bash backend/deploy/install.sh` | fills the launchd plists with *your* absolute paths + venv, then loads them |
| Tailscale account + apps | free, on Mac **and** phone | private phone→Mac link |
| Your Mac's tailnet IP | `tailscale ip -4` → `100.x.y.z` | the address you open on the phone |
| (optional) API token | uncomment in the backend plist template | only if you expose it beyond Tailscale |

> The plists in `backend/deploy/` are **templates** with `__BACKEND_DIR__` /
> `__PYTHON__` placeholders — don't load them directly; `install.sh` substitutes
> your real paths. That's what makes this repo work on someone else's machine.

## 1. Install the always-on services

```bash
cd backend
uv sync                     # once: creates the virtualenv
bash deploy/install.sh      # loads com.arise.backend + com.arise.backup + com.arise.digest
```

`install.sh` writes `~/Library/LaunchAgents/com.arise.{backend,backup,digest,deploy}.plist`
with your paths and starts them. The backend then runs at login, restarts on
crash, and relaunches after a reboot (uvicorn on `0.0.0.0:8000`), and
`com.arise.deploy` keeps the app itself up to date (see step 3).

Control it:

```bash
launchctl print gui/$(id -u)/com.arise.backend | grep -E "state|pid"   # status
launchctl kickstart -k gui/$(id -u)/com.arise.backend                  # restart
launchctl kickstart -k gui/$(id -u)/com.arise.deploy                   # deploy now
tail -f backend/logs/backend.log                                       # logs
bash deploy/uninstall.sh                                               # remove (keeps data)
```

It runs **tokenless** because Tailscale is the security boundary (the API is
never on the public internet). To require a token anyway, uncomment the
`EnvironmentVariables` block in `deploy/com.arise.backend.plist`, re-run
`install.sh`, and set the same value in the app under Settings → System link.

## 2. Tailscale (free personal plan)

1. Make a free account at https://tailscale.com.
2. Install Tailscale on your **Mac** and sign in.
3. Install Tailscale on your **phone**, signed in with the **same** account.
4. Get your Mac's tailnet IP: `tailscale ip -4` (a `100.x.y.z` address).

That address reaches your Mac from anywhere your phone has internet.

## 3. The web app (built and deployed for you)

The backend serves `dist/` at `/`, so the app and its data share one origin (it
auto-connects — no URL to type). `dist/` is **gitignored** — it's a build output —
which is why a `git pull` on its own never updates what the phone sees.

`install.sh` schedules **`com.arise.deploy`** to close that gap. Every 2 minutes
it fast-forwards `main`, rebuilds the web app *only* if the frontend actually
changed, and restarts the backend *only* if something needs it. With no new commit
it's one `git fetch` and out. So: push to `main`, and the phone catches up on its
own — the check costs milliseconds, and a full rebuild is about 20 seconds, so
you're waiting well under three minutes.

Don't want to wait at all? `launchctl kickstart -k gui/$(id -u)/com.arise.deploy`
deploys immediately.

It's deliberately timid — it refuses to act and says why, rather than guessing:

| Situation | What it does |
|---|---|
| Uncommitted changes in the tree | skips, touches nothing |
| Checked out on a branch other than `main` | skips, touches nothing |
| Local branch diverged from origin | skips (`--ff-only`, so it can never invent a merge) |
| Build fails | keeps serving the previous build, logs the failure |
| Backend-only commit | restarts, doesn't rebuild |

The build runs beside the live one and is swapped in when it's finished, so the
phone is never served a half-written app.

Build or deploy by hand any time:

```bash
./scripts/build-web.sh                    # just build (into dist/)
./scripts/deploy.sh                       # pull + build-if-needed + restart-if-needed
tail -f backend/logs/deploy.log           # what it's been doing
```

> One prerequisite: `git fetch` has to work **non-interactively** in that repo —
> the credential is stored in the macOS keychain, or the remote is SSH with a
> loaded key. If it can't authenticate it logs the failure and changes nothing.
> `ARISE_DEPLOY_BRANCH` overrides the branch it tracks (default `main`).

## 4. Keep the Mac awake

The Mac is the server — asleep, it can't answer. Keep it plugged in, and stop it
sleeping while on power:

```bash
sudo pmset -c sleep 0 disablesleep 1    # on a desktop / always-plugged Mac
# or, ad hoc: run `caffeinate -s` in a terminal to keep it awake for a session
```

## 5. Install it on your iPhone

1. In Safari, open **`http://<your-tailnet-ip>:8000/`** (from step 2). The app
   loads and auto-connects — same origin, no server URL to type.
2. **Share → Add to Home Screen.** You get a full-screen "Arise" icon.

Tailscale also routes locally on the same Wi-Fi, so that one address works at
home and away.

## Optional: AI-personalised quests (Gemini free tier)

Off by default — with no key set, quests come from the handcrafted pools. To turn
on AI personalisation (quests tuned and sequenced to you):

1. Get a free key at https://aistudio.google.com/apikey (Google AI Studio).
2. Put it in **`backend/.env`** (git-ignored — never committed):
   ```bash
   cd backend
   cp .env.example .env
   # edit .env and set:  ARISE_LLM_API_KEY=your-key-here
   ```
   The default model is `gemini-flash-latest` (tracks the current flash model;
   older ids like `gemini-2.0/2.5-flash` may be retired or give new keys a
   free-tier limit of 0). Override with `ARISE_LLM_MODEL` in `.env` if needed.
3. Load it: `bash deploy/install.sh`, then
   `launchctl kickstart -k gui/$(id -u)/com.arise.backend`. The service sources
   `.env` at startup, so your key stays out of the plist and out of git.

The app then personalises each period in one cached call (a few small calls a
day → free tier is plenty). Set your level per subject under **Settings → Focus
areas → "Where I'm at"** so it can prescribe your next step. Anything goes wrong
(no key, offline, rate limit) and it silently falls back to the pools.

> Privacy: your focus/level/book/recent-activity are sent to the Gemini API under
> your own key. Minimal, but yours to weigh. It's entirely optional.

## Recall — the daily digest email (optional)

What you read yesterday, distilled into a handful of lines and mailed to you the
next morning — plus a few highlights from ~3, 7 and 30 days back, which is the
part that actually makes things stick. Log what you read under **You → Learn**;
the reading daily and your quest reflections are folded in automatically.

1. Get a free [Resend](https://resend.com) key (100 emails/day, no card — you
   need one a day). **Sign up with the address you want the digest sent to.**
   Until you verify a domain of your own, the shared `onboarding@resend.dev`
   sender may only send to the account's own signup address; anything else comes
   back 403.
2. Add to `backend/.env`:
   ```bash
   ARISE_RESEND_API_KEY=re_your-key
   ARISE_DIGEST_TO=you@example.com
   ```
   Distilling uses the same Gemini key as everything else, so `ARISE_LLM_API_KEY`
   has to be set too. Leave either blank and nothing is ever sent.
3. Reload: `bash deploy/install.sh`, then
   `launchctl kickstart -k gui/$(id -u)/com.arise.backend`.

`com.arise.digest` then runs at 07:00 daily (log: `backend/logs/digest.log`).
Send one by hand any time: `.venv/bin/python scripts/send_digest.py 2026-08-07`.
Sending is once-per-day, so an extra run can't double-mail you.

Emails come from Resend's shared `onboarding@resend.dev` unless you set
`ARISE_DIGEST_FROM` to a domain you've verified — check spam on the first one.
Preview without sending (and tune the wording) at `/digest/preview?day=…`.

## Backups

`install.sh` also schedules `com.arise.backup`: a daily snapshot of `arise.db`
(WAL-safe, via SQLite's online backup) into `backend/backups/`, last 30 kept.
Take one by hand any time: `.venv/bin/python scripts/backup_db.py`.

> Note: this is a web app (WebView), so iOS won't do native push notifications.
> The DESIGN.md roadmap covers a native build if you want those later.
