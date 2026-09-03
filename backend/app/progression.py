"""Per-attribute progression — earned difficulty that climbs as you show up.

The idea (Solo Leveling, made gentle): every attribute has a *level* that starts
at 0 and grows the more consistently you clear its floor. Each completed week is
settled once:

  days you cleared  ≥  3 + current level (capped at 6)  →  level up
  fewer than that                                        →  ease down one
  a full week of *intentional rest* (rest days, no real work)  →  freeze

So the bar to advance rises as you climb (3, 4, 5, then 6), and easing down when
you miss it means the floor auto-settles at the difficulty that matches your real
consistency — you're never stranded at a level that's too hard after a rough
patch. Two things stay permanent, SL-style:

  • **peak** — the highest level you've ever reached. It never drops, so what you
    achieved is never erased; a dip is always framed as a run-up, not a fall.
  • the app's XP / character level / rank (elsewhere) only ever climb.

Everything here is PURE and deterministic: level and peak are *derived* by
replaying the completed weeks, exactly like the rest of the read model. No state
of its own to persist beyond the one anchor week (see Player.progression_start_week)
that keeps history from counting retroactively — progression begins the day you
turn it on, from zero.
"""

from datetime import date, timedelta

from . import game

# Each attribute's daily quest — clearing its floor is what "showing up" means.
# Charisma and Wealth are absent on purpose: neither has a daily any more (Charisma
# is weekly and side only; Wealth's study moved to the Learn tab), and an attribute
# with nothing to clear must not be settled at all — see `_settle_week`.
DAILY_BY_STAT: dict[str, str] = {
    "STR": "d-train",
    "CRE": "d-sketch",
    "SPI": "d-meditate",
    "INT": "d-read",
    "CFT": "d-craft",
}

# How many leading steps of a daily quest are the mandatory floor. Doing just
# these counts the day as cleared (the rest is "and then some"). 0 → the area has
# no floor (Creativity, Connection), so clearing means completing the daily.
FLOOR_LEN: dict[str, int] = {
    "d-train": 2,   # push-ups + plank
    "d-meditate": 1,
    "d-read": 1,    # read your chapter(s)
    "d-craft": 1,   # read the one source you're studying, and log it
    "d-sketch": 0,
}

# The ceiling per attribute — "you've built a strong habit, now maintain it".
# Past the cap, clearing just holds your level. Keep in step with the number of
# tiers each area actually defines (floors in quests.FLOORS, or content bands).
CAP: dict[str, int] = {
    "STR": 5,
    "SPI": 5,
    "WLT": 5,
    "INT": 5,
    "CFT": 5,  # foundation → building → depth (fluency → patterns → system design)
    "CRE": 4,
    "CHA": 4,
}


def required_days(level: int) -> int:
    """Days you must clear this week to level up: 3 at Lv0, rising to a steady 6.

    Gentle at the start (just show up three times), then it asks for real
    consistency once you're established."""
    return min(3 + level, 6)


BAND_LABELS = {0: "foundation", 1: "building", 2: "depth"}


def band_for(level: int) -> int:
    """Which content band a level draws from: 0 foundation, 1 building, 2 depth.

    Used where 'harder' isn't a number (Creativity, Connection, and the flavour
    of the learning content) — the quests grow in ambition, not reps."""
    return min(level // 2, 2)


def week_start(week_key: str) -> date:
    """The Monday of an ISO week key like '2026-W29' (as game.week_key emits)."""
    year, _, wk = week_key.partition("-W")
    return date.fromisocalendar(int(year), int(wk), 1)


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def completed_weeks(start: date, today: date) -> list[str]:
    """ISO week keys for every week that has fully ended, from `start`'s week up
    to (but not including) the week containing `today`. The current, in-progress
    week is never settled — it only counts once it's over."""
    monday, end = _monday(start), _monday(today)
    out: list[str] = []
    while monday < end:
        out.append(game.week_key(monday.isoformat()))
        monday += timedelta(days=7)
    return out


def _settle_week(level: int, real: int, rest: int, cap: int, available: int) -> int:
    """Apply one completed week's outcome to the level.

    `available` is how many days of that week the attribute's daily was actually
    dealt. You can only be asked for days you were given, so the bar never exceeds
    it — Creativity sits on one weekday, and asking it for three would ratchet the
    level down every week no matter how faithfully it was cleared. An attribute
    with no daily at all freezes: nothing to clear is not the same as failing."""
    if available <= 0:
        return level
    if real == 0 and rest > 0:
        return level  # a full week of intentional rest → freeze, no drop
    if real + rest >= min(required_days(level), available):
        return min(level + 1, cap)
    return max(level - 1, 0)


def replay(weeks: list[str], real_by_week: dict[str, int], rest_by_week: dict[str, int],
           cap: int, available: int = 7) -> tuple[int, int]:
    """Replay completed weeks in order → (current level, all-time peak).

    real_by_week / rest_by_week are day counts per ISO week: `real` = days the
    floor was actually met, `rest` = intentional rest days (disjoint from real).
    `available` is how many days a week the attribute's daily is dealt."""
    level = peak = 0
    for wk in weeks:
        level = _settle_week(level, real_by_week.get(wk, 0), rest_by_week.get(wk, 0), cap, available)
        peak = max(peak, level)
    return level, peak


def compute(
    real_days: dict[str, set[str]],
    rest_days: dict[str, set[str]],
    start: date,
    today: date,
    available: dict[str, int] | None = None,
) -> dict[str, dict]:
    """Full progression for every attribute.

    real_days[stat]  = days the stat's floor was met (not via rest)
    rest_days[stat]  = intentional rest days that protected the stat (disjoint)
    available[stat]  = days a week that stat's daily is dealt (default 7)

    Returns per stat: level, peak, required (days needed for the next level),
    cleared_this_week (progress so far), and band (content tier)."""
    weeks = completed_weeks(start, today)
    this_week = game.week_key(today.isoformat())
    out: dict[str, dict] = {}
    slots = available or {}
    for stat in game.STAT_KEYS:
        cap = CAP.get(stat, 5)
        days = slots.get(stat, 7)
        real, rest = real_days.get(stat, set()), rest_days.get(stat, set())
        real_by_week: dict[str, int] = {}
        rest_by_week: dict[str, int] = {}
        for d in real:
            wk = game.week_key(d)
            real_by_week[wk] = real_by_week.get(wk, 0) + 1
        for d in rest:
            wk = game.week_key(d)
            rest_by_week[wk] = rest_by_week.get(wk, 0) + 1
        level, peak = replay(weeks, real_by_week, rest_by_week, cap, days)
        cleared_now = sum(1 for d in real if game.week_key(d) == this_week) + sum(
            1 for d in rest if game.week_key(d) == this_week
        )
        out[stat] = {
            "level": level,
            "peak": peak,
            "cap": cap,
            # Never ask for more days than the week actually offers.
            "required": min(required_days(level), days) if days else 0,
            "cleared_this_week": cleared_now,
            "band": band_for(level),
        }
    return out
