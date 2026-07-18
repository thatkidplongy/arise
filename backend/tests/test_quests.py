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
    title, desc, steps, resource = a
    assert title and desc and isinstance(steps, list) and isinstance(resource, str)


def test_daily_content_rotates_across_days():
    q = _q("d-sketch", "CRE", "daily")
    titles = {quests.content_for(q, f"2026-07-{d:02d}")[0] for d in range(10, 25)}
    assert len(titles) > 1  # not the same every day


def test_daily_anchor_is_always_present():
    # The physical daily carries a non-negotiable core (push-ups + plank) that
    # shows every day regardless of which conditioning variant is picked.
    q = _q("d-train", "STR", "daily")
    for d in range(10, 25):
        _, _, steps, _ = quests.content_for(q, f"2026-07-{d:02d}")
        assert steps[:2] == quests.ANCHORS["d-train"]  # anchor comes first
        assert any("plank" in s for s in steps)


def test_resource_matches_variant_title():
    # A learning quest surfaces its trusted source, keyed by the day's variant.
    q = _q("d-read", "INT", "daily")
    for d in range(10, 25):
        title, _, _, resource = quests.content_for(q, f"2026-07-{d:02d}")
        assert resource == quests.RESOURCES.get(title, "")


def test_all_resource_keys_exist_as_variant_titles():
    titles = {v[0] for pool in quests.POOLS.values() for v in pool}
    missing = [t for t in quests.RESOURCES if t not in titles]
    assert not missing, missing  # every citation maps to a real variant


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
        title, desc, steps, _ = quests.content_for(q, f"2026-07-{d:02d}", focus)
        assert desc.startswith("Your focus: ")
        seen.add(desc.removeprefix("Your focus: "))
    assert seen <= set(focus)  # only ever picks from the set
    assert len(seen) > 1  # and rotates through it


def test_no_focus_uses_pool():
    q = _q("s-drill", "STR", "side")
    title, desc, _, _ = quests.content_for(q, "2026-07-18", None)
    assert not desc.startswith("Your focus:")
