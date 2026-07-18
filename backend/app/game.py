"""The System's rules: XP curves, ranks, streaks. Pure functions, no database."""

from datetime import date, timedelta

STAT_KEYS = ["STR", "CRE", "SPI", "CHA", "INT", "WLT", "CFT"]

DAILY_CLEAR_BONUS = 15
DAILY_CLEAR_ID = "daily-clear"

# An intentional rest day. Keeps the streak alive (rest is part of the path) but
# isn't a quest completion and earns no XP — it just says "I showed up for myself
# by resting today."
REST_DAY_ID = "rest-day"

# Rank requires level AND best-ever streak, so consistency can't be skipped.
RANK_GATES = [
    {"rank": "E", "level": 1, "streak": 0},
    {"rank": "D", "level": 10, "streak": 7},
    {"rank": "C", "level": 20, "streak": 14},
    {"rank": "B", "level": 32, "streak": 21},
    {"rank": "A", "level": 46, "streak": 30},
    {"rank": "S", "level": 60, "streak": 50},
]


def xp_to_next(level: int) -> int:
    """XP needed to go from `level` to `level + 1`."""
    return 80 + (level - 1) * 40


def level_info(total_xp: int) -> dict:
    level, rest = 1, total_xp
    while rest >= xp_to_next(level):
        rest -= xp_to_next(level)
        level += 1
    return {"level": level, "into": rest, "needed": xp_to_next(level)}


def stat_xp_to_next(level: int) -> int:
    """Stats level on a cheaper curve so they move visibly."""
    return 50 + (level - 1) * 30


def stat_level_info(xp: int) -> dict:
    level, rest = 1, xp
    while rest >= stat_xp_to_next(level):
        rest -= stat_xp_to_next(level)
        level += 1
    return {"level": level, "into": rest, "needed": stat_xp_to_next(level)}


def rank_for(level: int, max_streak: int) -> str:
    current = "E"
    for gate in RANK_GATES:
        if level >= gate["level"] and max_streak >= gate["streak"]:
            current = gate["rank"]
    return current


def next_gate(level: int, max_streak: int) -> dict | None:
    for gate in RANK_GATES:
        if level < gate["level"] or max_streak < gate["streak"]:
            return gate
    return None


def week_key(day: str) -> str:
    """ISO week of a 'YYYY-MM-DD' day, e.g. '2026-W29'. Weekly quests reset on Monday."""
    iso = date.fromisoformat(day).isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def current_streak(active_days: set[str], today: str) -> int:
    """Consecutive active days ending today — or yesterday, so the streak isn't
    shown as broken before you've had a chance to act today."""
    d = date.fromisoformat(today)
    if today not in active_days:
        d -= timedelta(days=1)
    streak = 0
    while d.isoformat() in active_days:
        streak += 1
        d -= timedelta(days=1)
    return streak


def max_streak(active_days: set[str]) -> int:
    """Longest run of consecutive active days ever — used for rank gates."""
    days = sorted(date.fromisoformat(d) for d in active_days)
    best = run = 0
    for i, d in enumerate(days):
        run = run + 1 if i > 0 and (d - days[i - 1]).days == 1 else 1
        best = max(best, run)
    return best
