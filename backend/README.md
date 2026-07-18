# Arise backend — The System's brain

FastAPI + SQLAlchemy + SQLite. All game logic (XP curves, ranks, streaks,
daily-clear bonus, achievements) runs here; the app is a client.

## Run

```bash
cd backend
uv sync                # first time: creates .venv and installs deps
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

- Interactive API docs: http://localhost:8000/docs
- The phone reaches it at `http://<your-mac-lan-ip>:8000` (same Wi-Fi).
- Database file: `backend/arise.db` (gitignored). Delete it for a factory reset.

## Auth

All endpoints except `/health` require `Authorization: Bearer <token>` when the
`ARISE_API_TOKEN` environment variable is set:

```bash
ARISE_API_TOKEN="$(openssl rand -hex 24)" uv run uvicorn app.main:app --port 8000
```

Left unset (the default), auth is disabled so local development stays
frictionless. On a public server, always set it — and put the same value in the
app under Settings → System Link.

## Layout

```
app/
  main.py          FastAPI app, CORS, startup (create tables + migrate + seed)
  routes.py        endpoints (thin wrappers)
  state.py         read model — derives the state payload from stored rows
  service.py       write operations (complete, undo, steps, prefs, rest, reset)
  game.py          pure rules: XP curves, ranks, streaks
  quests.py        rotating quest content + step generator
  achievements.py  achievement predicates
  models.py        tables: players, quest_defs, completions, unlocks,
                   preferences, step_checks
  schemas.py       pydantic request/response contracts
  seed.py          quest slot definitions
  db.py            engine/session, WAL pragmas, additive migrations
scripts/
  backup_db.py     daily DB snapshot (launchd: deploy/com.arise.backup.plist)
  smoke.py         quick liveness check against a running server
tests/             pytest: unit (game/quests/achievements) + API + migration
```

## Tests & backups

```bash
uv run pytest                       # unit + integration + migration
.venv/bin/python scripts/backup_db.py   # manual snapshot → backups/
python scripts/smoke.py http://localhost:8000   # liveness check
```

SQLite runs in WAL mode; the daily launchd job keeps the last 30 snapshots in
`backend/backups/`.

## Design notes

- `completions` is the source of truth; totals, streaks and achievements are
  derived from it on read. Simple, and history-rewriting features stay easy.
- The client sends its local date (`day`) with every call — the phone knows
  what "today" means better than the server does.
- Single player row today; every table already carries `player_id`, so
  multi-user is additive, not a rewrite.
