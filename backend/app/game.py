"""The System's rules: XP curves, ranks, streaks. Pure functions, no database."""

from datetime import date, timedelta

STAT_KEYS = ["STR", "CRE", "SPI", "CHA", "INT", "WLT", "CFT"]

# Clearing every area in a day is worth more than any single card on it — at a
# daily's 25 that means comfortably above 25, not the 15 it sat at when a daily
# was 10 and the bonus was the biggest thing you could earn in a day.
DAILY_CLEAR_BONUS = 30
DAILY_CLEAR_ID = "daily-clear"

# An intentional rest day. Keeps the streak alive (rest is part of the path) but
# isn't a quest completion and earns no XP — it just says "I showed up for myself
# by resting today."
REST_DAY_ID = "rest-day"


def is_rest(quest_id: str) -> bool:
    """True for the rest-day marker — keeps the streak, but isn't a quest."""
    return quest_id == REST_DAY_ID


def is_marker(quest_id: str) -> bool:
    """True for a bookkeeping completion row (rest day or daily-clear bonus) rather
    than a real quest completion. One place to ask, so new markers stay in sync."""
    return quest_id in (REST_DAY_ID, DAILY_CLEAR_ID)

# Rank requires level AND best-ever streak, so consistency can't be skipped.
RANK_GATES = [
    {"rank": "E", "level": 1, "streak": 0},
    {"rank": "D", "level": 10, "streak": 7},
    {"rank": "C", "level": 20, "streak": 14},
    {"rank": "B", "level": 32, "streak": 21},
    {"rank": "A", "level": 46, "streak": 30},
    {"rank": "S", "level": 60, "streak": 50},
]


# Both curves were pitched when a daily was worth 10 XP. A daily is 25 now, and a
# perfect day is 155 — five dailies plus the clear bonus — so the old numbers bought
# a character level every half day at the bottom and put rank D inside a fortnight.
# Both are scaled by three: every level costs exactly triple what it did, which
# leaves the *shape* the ranks and achievements were pitched against untouched and
# moves only the pace. Rescaling is safe by construction — a completion stores the
# XP it was awarded (see quests.py), so this only changes what the next level costs,
# never what past days earned. It does re-derive the *current* level downward,
# because level is computed from banked XP rather than stored alongside it.


def xp_to_next(level: int) -> int:
    """XP needed to go from `level` to `level + 1`."""
    return 240 + (level - 1) * 120


def level_info(total_xp: int) -> dict:
    level, rest = 1, total_xp
    while rest >= xp_to_next(level):
        rest -= xp_to_next(level)
        level += 1
    return {"level": level, "into": rest, "needed": xp_to_next(level)}


# Breadth: XP only counts toward your character level in proportion to how many
# attributes the day touched. Before this, the level was plain accumulated XP, and
# the board deals Intelligence two or three dailies a day, so Intelligence alone
# took you to the next level in about four days. A day's XP now counts toward the
# level as XP × touched / of, where `of` is the attributes the board dealt that day
# plus any others you touched anyway. Clear the whole board and it all counts. An
# Intelligence-only day counts a third or a quarter. Doing an extra attribute (a
# hangout, a money move) never lowers the fraction, because it raises both sides.
#
# Only the *level* is weighted. Every card still pays its full XP, and it still lands
# on its attribute's own bar. `total_xp` stays the plain sum of everything earned.
# Days before BREADTH_FROM count in full, so nothing that was already banked is
# recounted and the level you'd reached can't be re-derived downward.
BREADTH_FROM = "2026-09-26"


def breadth(touched: set[str], dealt: set[str]) -> tuple[int, int]:
    """(touched, of) for one day: how many attributes it touched, out of how many
    it asked for plus any others it touched. (0, 0) when there was nothing to touch."""
    return len(touched), len(dealt | touched)


def level_xp_for_day(day: str, xp: int, touched: set[str], dealt: set[str]) -> int:
    """How much of a day's `xp` counts toward the character level (see BREADTH_FROM)."""
    n, of = breadth(touched, dealt)
    if day < BREADTH_FROM or of == 0:
        return xp
    return xp * n // of


def stat_xp_to_next(level: int) -> int:
    """Stats level on a cheaper curve so they move visibly. Scaled with the character
    curve above so it stays the *same* fraction of it — cheaper, not trivial."""
    return 150 + (level - 1) * 90


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
