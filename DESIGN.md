# ARISE — The System · Design Document

A Solo Leveling-inspired personal progression system. One Player, six areas of
life, one goal: become your best version by showing up — at whatever pace you can.

## Philosophy — a guide, not a taskmaster

Every feature and every line of copy is checked against this:

- **Invite, don't command.** Quests are invitations toward who you want to be.
  No "must", no "non-negotiable". A good day is that you showed up at all.
- **Discipline, gently.** Small and consistent beats fast and forced. Celebrate
  any progress, not just perfect days.
- **Forgiveness is built in.** Rest days keep your streak; a missed day is never
  framed as failure. There are deliberately **no punishment mechanics**.
- **Keep the why in view.** The player's North Star sits atop the Status screen.
- **Room to live.** Rest and enjoying life are part of the path, not a detour.

## The Six Attributes (Party Composition)

| Slot | Hobby | Stat | Notes |
|---|---|---|---|
| Healthy | Badminton + conditioning | **STR** | Sessions are "dungeon raids"; the daily rotates its conditioning but always opens with a fixed push-ups + plank floor, tuned for toning, not bulk |
| Creative | Drawing, music (FL Studio), photo/video | **CRE** | Visible output, cheap to start |
| Peaceful | Meditation | **SPI** | Calm, focus, reflection, breath — 10 min baseline |
| Connect | Social quests | **CHA** | Weekly gathering + daily micro-connections (ambivert-friendly) |
| Grow | Coding, math, Japanese, reading, the world | **INT** | Reads a book a week (a chapter a day is the mandatory floor); the rest — code/math/Japanese/history/science — rotates on top |
| Wealth | Making money | **WLT** | Fundamentals, side income, monetising your skills, and managing/growing money |

Time budget: 30 min–2 hrs/day. Minimum daily loop ≈ 80 minutes — but showing up
for any of it is the win.

## Quests

- **Daily Quests** — one per attribute, 10 XP each. Completing all of them grants
  a **+15 XP Daily Clear bonus**.
- **Weekly Quests** — the raids. Badminton ×2/week (40 XP each), one hangout
  (50 XP), one finished drawing (40 XP), 3 book chapters (40 XP), one 30-min
  meditation (30 XP). Reset every Monday (ISO week).
- **Side Quests** — optional, 15 XP, each completable once per day.

The quests are stable **slots** (`quest_defs` table, seeded by
`backend/app/seed.py`): their id, stat, xp, cadence and target never change — so
completions, streaks and achievements keep counting. What rotates is each slot's
title/description/steps. Seeding is additive and idempotent — a new slot reaches
a database that was created before it existed, without touching your progress.

## Rotating content & coaching steps

`backend/app/quests.py` holds a hand-written pool of variants per slot. The
variant shown is chosen by `md5(slot + period)` — the day for daily/side quests,
the ISO week for weekly ones — so the board is stable within a period and fresh
next period. Deterministic, offline, free (no LLM).

```mermaid
flowchart LR
  slot["quest slot<br/>id · stat · cadence"] --> pick["md5(slot + period) % N"]
  period["period key<br/>day or ISO week"] --> pick
  pick --> variant["pool variant<br/>title · desc · steps (+anchor · resource)"]
  focus["focus set<br/>(side quests only)"] -. overrides .-> variant
```

Each variant carries **steps**: concrete instructions (reps × sets, timed
segments, prompts). For single-completion quests these render as a **tickable
checklist** (`step_checks` table, scoped to the period). Ticking the last step
auto-completes the quest — with a floating toast + undo — and the completion
circle fills proportionally as steps are ticked. Multi-session quests (e.g.
badminton ×2) keep steps as guidance and the tap-to-log flow.

## Daily non-negotiables (anchors)

Some daily quests carry a fixed **non-negotiable** core (`ANCHORS` in
`quests.py`, plus the reading floor): a small floor prepended to that day's steps
and met every day regardless of which variant shows — the physical daily always
opens with push-ups + plank; Peaceful with a few slow breaths; Wealth with
logging the day's spending; and **Grow always opens with "read a chapter of your
current book"**, on top of the day's rotating learning (code, math, Japanese…).
It's deliberately light — a minimum you never skip, not a second workout — with
the rotating steps as the "and then some". Connect and Creativity have no fixed
floor: their single rotating action *is* the day's commitment, and creativity is
better served by variety than a rigid routine.

## Reading loop (a book a week)

Reading is its own loop: a chapter a day (the Grow floor above) ≈ a book a week.
The player's `current_book` lives on `players`; each new ISO week, if a book has
been in progress since a prior week, the app surfaces a **weekly review** — *"Did
you finish it?"* Finished → `books_finished` ticks up and they name the next
book; not yet → it carries over, no penalty (`service.review_book`). The review
is asked at most once per week (`book_review_week` guards it). Setting or
changing the book restarts that weekly clock.

## Learning resources (citations)

Where a quest is about *learning* something, it points at one popular,
well-trusted source (`RESOURCES` in `quests.py`), keyed by the variant's title
so the pointer matches the day's focus — a book, a YouTube channel, or a
reference site (e.g. *Atomic Habits*, Khan Academy, *The Psychology of Money*,
Badminton Insight). It surfaces as a small "Learn: …" line on the quest card.

## Focus areas (personalization)

Each attribute has an optional **set of focuses** (`preferences` table; the
`focus` column stores a JSON list). A saved focus rotates that attribute's *side
quest* through the set day to day (`Your focus: …`). Free, keyword-simple; the
architecture leaves room to swap in LLM-generated quests later without changing
the slot model.

## North Star

A free-text line the player writes (`players.north_star`) about the life they're
reaching for — pinned to the top of the Status screen as their reason.

## Rest & forgiveness

A **rest day** records a `rest-day` completion: it earns no XP and isn't a quest
completion, but it counts as an active day, so the streak survives. The current
streak also has a one-day grace (yesterday's streak isn't "broken" while today is
still in progress). Ranks use *best-ever* streak, so they never regress.

## XP & Levels

- Hunter level: XP to go from level *n* to *n+1* is `80 + (n−1)·40`.
  Early levels come fast (motivation), later ones feel earned.
- Stats level independently on a cheaper curve: `50 + (n−1)·30`.
- The Daily Clear bonus counts toward hunter XP only, not stats.

## Ranks (E → S)

Rank requires **level + best-ever streak**, so consistency can't be skipped:

| Rank | Level | Best streak |
|---|---|---|
| E | 1 | — |
| D | 10 | 7 days |
| C | 20 | 14 days |
| B | 32 | 21 days |
| A | 46 | 30 days |
| S | 60 | 50 days |

A streak day = any day with at least one quest completion. The current streak
survives until end of today (yesterday's streak isn't "broken" while today is
still in progress).

## Achievements & Titles

Defined in `backend/app/achievements.py` as pure predicates over a progress
snapshot. Some grant equippable **titles** shown on the status window
(e.g., "The Awakened", "Iron-Willed", "Shuttlecock Slayer").

## Architecture (API-first)

Completing a quest, end to end:

```mermaid
sequenceDiagram
  participant App
  participant routes as routes.py
  participant service as service.py
  participant state as state.py
  participant DB as SQLite
  App->>routes: POST /completions {quest_id, day}
  routes->>service: complete_quest(...)
  service->>DB: insert completion (+ daily-clear bonus?)
  service->>state: build_state()
  state->>DB: read completions
  state-->>service: derived state (xp, level, rank, streak)
  service-->>routes: { events, state }
  routes-->>App: 200 — app shows toast/notices, re-renders
```

- The server is the source of truth; the app renders one `GET /state` payload.
- `POST /completions` returns **events** (daily clear, level up, rank up,
  achievement) which the app shows as System pop-ups.
- The client sends its local date with every call — the phone knows what
  "today" means better than the server does.
- The `completions` table is the source of truth; XP totals, streaks, and
  achievements are derived from it on read.
- **Backend modules split by concern:** `routes.py` (thin HTTP) → `state.py`
  (read model: derives the state payload from rows) and `service.py` (write
  operations). Pure rules live in `game.py`; quest content in `quests.py`.
- **Durability:** SQLite runs in WAL mode; a launchd job snapshots the DB daily
  (`scripts/backup_db.py` → `backend/backups/`, last 30). Tested with pytest
  (unit + integration + migration).
- **Scaling path:** swap `ARISE_DATABASE_URL` to Postgres; every table already
  carries `player_id`, so multi-user is additive. The honest tradeoff of
  API-first: the app needs the server reachable (an offline queue is a
  possible future patch).

## Design Language — "sandy" minimal

Restraint is the aesthetic. Simplicity comes from taking things away, not from
stacking trends (an earlier glass/glow/gradient version read as generic
"AI-designed" — this replaced it).

- **Warm and flat** — a sand page (`#F0E8D8`), ivory cards, espresso text. No
  gradients, glows, blur, neon, or bracketed corners. Cards are a 1px warm
  hairline and nothing more.
- **One accent** — a muted clay (`#B0603A`), used sparingly (progress fills,
  the active tab, primary buttons). Stats use desaturated earthy tones
  (clay, ochre, sage, mauve, slate) so five categories stay legible without
  shouting.
- **Type does the work** — system sans, two weights (regular + semibold),
  sentence case everywhere (no ALL-CAPS labels, no wide letter-spacing).
  Hierarchy comes from size and spacing.
- **Semantic tokens** — components consume roles (`surface.card`,
  `text.secondary`, `accent`), never raw hex.
- **Quiet motion** — XP bars ease on change; quest cards tint on press; the
  System notice springs in gently. Never decorative.

## Roadmap (patches)

- v2.1 — Daily reminder notifications (needs a dev build; Expo Go limits these)
- v2.2 — History / calendar view of past days
- v2.3 — Boss fights (milestone quests) and more titles — encouragements, never
  penalties (the philosophy rules out punishment for missed days)
- v3.0 — Standalone installed builds (Android APK, iOS via Xcode); cloud deploy
  of the backend for anywhere-access
