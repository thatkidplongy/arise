"""Unit tests for the deterministic quest generator — no database involved."""

from app import quests
from app.models import QuestDef


def _q(qid: str, stat: str, cadence: str, target: int = 1) -> QuestDef:
    return QuestDef(id=qid, title="seed", desc="seed", stat=stat, xp=10, cadence=cadence, target=target)


def test_period_key():
    assert quests.period_key("daily", "2026-07-18") == "2026-07-18"
    assert quests.period_key("side", "2026-07-18") == "2026-07-18"
    assert quests.period_key("weekly", "2026-07-18").startswith("2026-W")


def test_content_is_deterministic_and_well_formed():
    q = _q("d-train", "STR", "daily")
    a = quests.content_for(q, "2026-07-18")
    b = quests.content_for(q, "2026-07-18")
    assert a == b  # stable within a period
    title, desc, steps = a
    assert title and desc and isinstance(steps, list)


def test_daily_content_rotates_across_days():
    q = _q("d-sketch", "CRE", "daily")
    titles = {quests.content_for(q, f"2026-07-{d:02d}")[0] for d in range(10, 25)}
    assert len(titles) > 1  # not the same every day


def test_all_pool_variants_are_triples_with_text():
    total = 0
    for sid, pool in quests.POOLS.items():
        for variant in pool:
            assert len(variant) == 3, sid
            title, desc, steps = variant
            assert title and desc and isinstance(steps, list)
            total += 1
    assert total > 50  # sanity: the pools are actually populated


def test_side_quest_focus_overrides_and_rotates():
    q = _q("s-drill", "STR", "side")
    focus = ["backhand", "smash footwork", "net play"]
    seen = set()
    for d in range(10, 25):
        title, desc, steps = quests.content_for(q, f"2026-07-{d:02d}", focus)
        assert desc.startswith("Your focus: ")
        seen.add(desc.removeprefix("Your focus: "))
    assert seen <= set(focus)  # only ever picks from the set
    assert len(seen) > 1  # and rotates through it


def test_no_focus_uses_pool():
    q = _q("s-drill", "STR", "side")
    title, desc, _ = quests.content_for(q, "2026-07-18", None)
    assert not desc.startswith("Your focus:")
