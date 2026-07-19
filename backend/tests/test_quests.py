"""Unit tests for the deterministic quest generator — no database involved."""

from datetime import date, timedelta

from app import quests
from app.models import QuestDef


def _q(qid: str, stat: str, cadence: str, target: int = 1) -> QuestDef:
    return QuestDef(id=qid, title="seed", desc="seed", stat=stat, xp=10, cadence=cadence, target=target)


def test_period_key():
    assert quests.period_key("daily", "2026-07-18") == "2026-07-18"
    # Side quests are a once-a-week optional bonus — same ISO-week period as weekly.
    wk = quests.period_key("weekly", "2026-07-18")
    assert wk.startswith("2026-W")
    assert quests.period_key("side", "2026-07-18") == wk


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


def test_daily_floor_is_always_present():
    # The physical daily carries a non-negotiable floor (push-ups + plank) that
    # shows every day regardless of which conditioning variant is picked. At Lv0
    # it's the gentlest tier of FLOORS.
    q = _q("d-train", "STR", "daily")
    for d in range(10, 25):
        _, _, steps, _ = quests.content_for(q, f"2026-07-{d:02d}")
        assert steps[:2] == quests.FLOORS["d-train"][0]  # floor comes first
        assert any("plank" in s for s in steps)


def test_floor_climbs_with_level():
    # Higher progression level → a harder floor (progressive overload).
    q = _q("d-train", "STR", "daily")
    lv0 = quests.content_for(q, "2026-07-18", level=0)[2]
    lv5 = quests.content_for(q, "2026-07-18", level=5)[2]
    assert lv0[:2] == quests.FLOORS["d-train"][0]
    assert lv5[:2] == quests.FLOORS["d-train"][5]
    assert "5 push-ups" in lv0[0] and "20 push-ups" in lv5[0]
    # Beyond the cap it just holds at the top tier — no runaway numbers.
    assert quests.content_for(q, "2026-07-18", level=99)[2][:2] == quests.FLOORS["d-train"][-1]


def test_reading_floor_scales_by_level_and_book():
    # Reading climbs by pace; a longer book asks more per day to keep pace.
    assert quests.reading_floor("A Book", 0) == "Read a chapter of A Book"
    fast = quests.reading_floor("A Book", 5, chapters=30)
    assert "chapters" in fast  # a 30-chapter book at a fast pace → several a day


def test_content_band_shifts_with_level():
    # INT variety is banded: foundation (learn-how-to-learn) at low levels,
    # domain/depth work higher up. Titles seen should differ across the range.
    q = _q("d-read", "INT", "daily")
    low = {quests.content_for(q, f"2026-07-{d:02d}", level=0)[0] for d in range(1, 28)}
    high = {quests.content_for(q, f"2026-07-{d:02d}", level=5)[0] for d in range(1, 28)}
    foundation = {"Active Recall", "Mind Map", "Feynman It", "Learn How to Learn"}
    assert low & foundation  # beginners get the fundamentals
    assert high - foundation - {"Grimoire Study", "Deep Page"}  # advanced get domain/depth work


def test_resource_matches_variant_title():
    # A learning quest surfaces its trusted source, keyed by the day's variant.
    q = _q("d-read", "INT", "daily")
    for d in range(10, 25):
        title, _, _, resource = quests.content_for(q, f"2026-07-{d:02d}")
        assert resource == quests.RESOURCES.get(title, "")


def test_all_resource_keys_exist_as_variant_titles():
    pools = list(quests.POOLS.values()) + list(quests.INTERVIEW_POOLS.values())
    titles = {v[0] for pool in pools for v in pool}
    missing = [t for t in quests.RESOURCES if t not in titles]
    assert not missing, missing  # every citation maps to a real variant


def test_craft_daily_floor_is_deep_work_minutes():
    # Craft's floor is a deep-work minimum that climbs with level (gentle at Lv0).
    q = _q("d-craft", "CFT", "daily")
    lv0 = quests.content_for(q, "2026-07-18", level=0)[2]
    lv5 = quests.content_for(q, "2026-07-18", level=5)[2]
    assert lv0[0] == quests.FLOORS["d-craft"][0][0]
    assert "15 focused minutes" in lv0[0] and "45 minutes" in lv5[0]


def test_craft_band_climbs_from_fluency_to_system_design():
    # Low levels favour fundamentals/fluency; high levels reach system design.
    q = _q("d-craft", "CFT", "daily")
    low = {quests.content_for(q, f"2026-07-{d:02d}", level=0)[0] for d in range(1, 28)}
    high = {quests.content_for(q, f"2026-07-{d:02d}", level=5)[0] for d in range(1, 28)}
    depth = {"Systems Thinking", "Architecture Read", "Tradeoff Study"}
    assert not (low & depth)  # beginners never see the depth band
    assert high & depth  # advanced work reaches system design


def test_interview_mode_swaps_craft_pool():
    # With interview on, Craft draws from the interview pool instead.
    q = _q("w-craft", "CFT", "weekly")
    steady = {quests.content_for(q, f"2026-07-{d:02d}", level=l)[0]
              for d in range(1, 28) for l in range(6)}
    prep = {quests.content_for(q, f"2026-07-{d:02d}", level=l, interview=True)[0]
            for d in range(1, 28) for l in range(6)}
    interview_titles = {"Behavioural Prep", "Mock Interview", "Mock System Design"}
    assert prep <= interview_titles  # interview mode only shows interview variants
    assert not (steady & interview_titles)  # steady mode never does


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
    # Side rotates weekly now, so sample one day per week across several weeks.
    seen = set()
    d = date(2026, 1, 5)
    for _ in range(12):
        desc = quests.content_for(q, d.isoformat(), focus)[1]
        assert desc.startswith("Your focus: ")
        seen.add(desc.removeprefix("Your focus: "))
        d += timedelta(days=7)
    assert seen <= set(focus)  # only ever picks from the set
    assert len(seen) > 1  # and rotates through it across weeks
    # Stable within a single ISO week (Mon vs Fri of the same week match).
    assert quests.content_for(q, "2026-07-13", focus)[1] == quests.content_for(q, "2026-07-17", focus)[1]


def test_no_focus_uses_pool():
    q = _q("s-drill", "STR", "side")
    title, desc, _, _ = quests.content_for(q, "2026-07-18", None)
    assert not desc.startswith("Your focus:")
