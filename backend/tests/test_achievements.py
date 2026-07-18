"""Unit tests for achievement predicates over a snapshot."""

from app.achievements import ACHIEVEMENTS, Snapshot


def _snap(**kw) -> Snapshot:
    base = dict(
        total_xp=0,
        level=1,
        stat_levels={"STR": 1, "CRE": 1, "SPI": 1, "CHA": 1, "INT": 1},
        max_streak=0,
        daily_clears=0,
        total_completions=0,
        side_completions=0,
        quest_counts={},
    )
    base.update(kw)
    return Snapshot(**base)


def _check(aid: str, snap: Snapshot) -> bool:
    return next(a for a in ACHIEVEMENTS if a.id == aid).check(snap)


def test_first_quest():
    assert not _check("first-quest", _snap(total_completions=0))
    assert _check("first-quest", _snap(total_completions=1))


def test_streak_and_level_gates():
    assert not _check("streak-7", _snap(max_streak=6))
    assert _check("streak-7", _snap(max_streak=7))
    assert _check("level-10", _snap(level=10))


def test_badminton_counts_by_quest_id():
    assert not _check("badminton-10", _snap(quest_counts={"w-badminton": 9}))
    assert _check("badminton-10", _snap(quest_counts={"w-badminton": 10}))


def test_stat_gate_any_attribute():
    assert _check("stat-10", _snap(stat_levels={"STR": 1, "CRE": 10, "SPI": 1, "CHA": 1, "INT": 1}))


def test_craft_gate():
    assert not _check("craft-5", _snap(stat_levels={"CFT": 4}))
    assert _check("craft-5", _snap(stat_levels={"CFT": 5}))
    assert _check("craft-15", _snap(stat_levels={"CFT": 15}))
