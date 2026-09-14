"""Unit tests for the pure game rules — no database involved."""

from app import game


def test_xp_curve_grows_linearly():
    assert game.xp_to_next(1) == 240
    assert game.xp_to_next(2) == 360
    assert game.xp_to_next(3) == 480


def test_level_info_accumulates():
    assert game.level_info(0) == {"level": 1, "into": 0, "needed": 240}
    assert game.level_info(239)["level"] == 1
    assert game.level_info(240) == {"level": 2, "into": 0, "needed": 360}
    assert game.level_info(600)["level"] == 3  # 240 + 360 = 600 → into level 3


def test_stat_curve_is_cheaper():
    assert game.stat_xp_to_next(1) == 150
    assert game.stat_level_info(150)["level"] == 2
    # Cheaper than the character curve at every level, which is the whole point.
    assert all(game.stat_xp_to_next(n) < game.xp_to_next(n) for n in range(1, 61))


def test_first_level_is_more_than_one_perfect_day():
    """A perfect day is five dailies at 25 plus the clear bonus. The first level
    used to cost half of that; the curve is no longer buyable in a single sitting."""
    perfect_day = 5 * 25 + game.DAILY_CLEAR_BONUS
    assert game.xp_to_next(1) > perfect_day


def test_rank_requires_both_level_and_streak():
    assert game.rank_for(1, 0) == "E"
    assert game.rank_for(10, 7) == "D"
    # High level but no streak stays low — consistency can't be skipped.
    assert game.rank_for(60, 0) == "E"
    assert game.rank_for(60, 50) == "S"


def test_next_gate_points_at_the_first_unmet():
    gate = game.next_gate(1, 0)
    assert gate is not None and gate["rank"] == "D"
    assert game.next_gate(60, 50) is None  # maxed


def test_week_key_format():
    assert game.week_key("2026-07-18").startswith("2026-W")


def test_streaks():
    days = {"2026-07-16", "2026-07-17", "2026-07-18"}
    assert game.current_streak(days, "2026-07-18") == 3
    assert game.max_streak(days) == 3
    # A one-day grace: yesterday active, today not yet → streak still counts.
    assert game.current_streak(days, "2026-07-19") == 3
    # A gap breaks the current streak.
    assert game.current_streak(days, "2026-07-21") == 0


def test_max_streak_finds_longest_run():
    days = {"2026-01-01", "2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"}
    assert game.max_streak(days) == 3
