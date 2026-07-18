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
bash deploy/install.sh      # loads com.arise.backend + com.arise.backup
```

`install.sh` writes `~/Library/LaunchAgents/com.arise.{backend,backup}.plist`
with your paths and starts them. The backend then runs at login, restarts on
crash, and relaunches after a reboot (uvicorn on `0.0.0.0:8000`).

Control it:

```bash
launchctl print gui/$(id -u)/com.arise.backend | grep -E "state|pid"   # status
launchctl kickstart -k gui/$(id -u)/com.arise.backend                  # restart
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

## 3. Build the web app (served by the backend)

```bash
./scripts/build-web.sh      # exports dist/, makes the home-screen icon + PWA meta
```

The backend serves `dist/` at `/`, so the app and its data share one origin (it
auto-connects — no URL to type). Rerun this (and `launchctl kickstart -k
gui/$(id -u)/com.arise.backend`) whenever you change the app's code.

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

## Backups

`install.sh` also schedules `com.arise.backup`: a daily snapshot of `arise.db`
(WAL-safe, via SQLite's online backup) into `backend/backups/`, last 30 kept.
Take one by hand any time: `.venv/bin/python scripts/backup_db.py`.

> Note: this is a web app (WebView), so iOS won't do native push notifications.
> The DESIGN.md roadmap covers a native build if you want those later.
