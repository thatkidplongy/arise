# ARISE — The System · Design Document

A Solo Leveling-inspired personal progression system. One Player, five hobbies,
one goal: become your best version by showing up every day.

## The Five Hobbies (Party Composition)

| Slot | Hobby | Stat | Notes |
|---|---|---|---|
| Healthy | Badminton + daily conditioning | **STR** | Sessions are "dungeon raids"; daily conditioning feeds them |
| Creative | Drawing | **CRE** | Visible progress, cheap to start |
| Peaceful | Meditation | **SPI** | 10 min/day baseline |
| Connect | Social quests | **CHA** | Weekly gathering + daily micro-connections |
| Grow | Reading (+ learning to code) | **INT** | Pages/day; building this app counts |

Time budget: 30 min–2 hrs/day. Minimum daily loop ≈ 65 minutes.

## Quests

- **Daily Quests** — one per stat, 10 XP each. Completing all five grants a
  **+15 XP Daily Clear bonus**.
- **Weekly Quests** — the raids. Badminton ×2/week (40 XP each), one hangout
  (50 XP), one finished drawing (40 XP), 3 book chapters (40 XP), one 30-min
  meditation (30 XP). Reset every Monday (ISO week).
- **Side Quests** — optional, 15 XP, each completable once per day.

Quest definitions live in `src/data/quests.ts` — adding a quest is adding one
object to that file.

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

Defined in `src/data/achievements.ts` as pure predicates over a progress
snapshot. Some grant equippable **titles** shown on the status window
(e.g., "The Awakened", "Iron-Willed", "Shuttlecock Slayer").

## Architecture

- **Expo + React Native + TypeScript**, expo-router for navigation (4 tabs:
  Status / Quests / Achievements / Settings).
- **State:** zustand store (`src/store/useSystem.ts`) persisted to
  AsyncStorage. Local-only; no backend, no accounts. Works offline.
- **Source of truth is the completion log** (`date → completions`). XP totals
  are stored, but streaks/counts/achievements are all derived from the log,
  so new features can be computed retroactively from history.
- **System notices** (level up, rank up, achievement) queue in the store and
  render as the classic blue System pop-up (`SystemNoticeHost`).

## Roadmap (patches)

- v1.1 — Daily reminder notifications (needs a dev build; Expo Go limits these)
- v1.2 — History / calendar view of past days
- v1.3 — Penalty quests for missed days, boss fights (milestones), more titles
- v2.0 — Standalone installed builds (Android APK, iOS via Xcode)
