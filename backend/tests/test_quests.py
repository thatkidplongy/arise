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
    # The physical daily carries a non-negotiable floor (push-ups + plank + a core
    # rep) that shows every day regardless of which conditioning variant is picked.
    # At Lv0 it's the gentlest tier of FLOORS.
    q = _q("d-train", "STR", "daily")
    floor0 = quests.FLOORS["d-train"][0]
    for d in range(10, 25):
        _, _, steps, _ = quests.content_for(q, f"2026-07-{d:02d}")
        assert steps[: len(floor0)] == floor0  # floor comes first
        assert any("plank" in s for s in steps)
        # An explosive (plyometric) core rep is always on top, whatever the workout.
        assert any("tuck jump" in s for s in steps)


def test_floor_climbs_with_level():
    # Higher progression level → a harder floor (progressive overload).
    q = _q("d-train", "STR", "daily")
    lv0 = quests.content_for(q, "2026-07-18", level=0)[2]
    lv5 = quests.content_for(q, "2026-07-18", level=5)[2]
    floors = quests.FLOORS["d-train"]
    assert lv0[: len(floors[0])] == floors[0]
    assert lv5[: len(floors[5])] == floors[5]
    assert "5 push-ups" in lv0[0] and "20 push-ups" in lv5[0]
    # Beyond the cap it just holds at the top tier — no runaway numbers.
    assert quests.content_for(q, "2026-07-18", level=99)[2][: len(floors[-1])] == floors[-1]


def test_reading_floor_asks_rather_than_setting_a_quota():
    # No number the app picked: the floor is to read and then record what you read.
    floor = quests.reading_floor("A Book")
    assert "A Book" in floor and "log" in floor
    assert not any(ch.isdigit() for ch in floor)
    assert "your current book" in quests.reading_floor(None)


def test_reading_floor_is_the_same_at_every_level():
    # Levelling up a reader shouldn't quietly raise the bar they have to clear.
    q = _q("d-read", "INT", "daily")
    floors = {quests.content_for(q, "2026-07-18", level=lvl)[2][0] for lvl in range(6)}
    assert len(floors) == 1


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


def test_craft_daily_floor_is_studying_the_notes():
    """Craft's floor is no longer minutes at a keyboard — it's studying the
    system-design notes, climbing by how much you produce from memory."""
    q = _q("d-craft", "CFT", "daily")
    lv0 = quests.content_for(q, "2026-07-18", level=0, craft_week=1)[2]
    lv5 = quests.content_for(q, "2026-07-18", level=5, craft_week=1)[2]
    assert lv0[0] == quests.FLOORS["d-craft"][0][0]
    assert "Notion" in lv0[0]
    assert "cold" in lv5[0]  # the top rung asks you to produce it, not recognise it
    assert not any("minutes" in step for step in lv0 + lv5)


def test_craft_daily_follows_the_twelve_week_plan_not_the_level():
    """The phase comes from the plan week, so theory lands before the reps that need
    it — a high level doesn't skip you ahead, and a low one doesn't hold you back."""
    q = _q("d-craft", "CFT", "daily")
    day = "2026-07-18"
    week1 = {quests.content_for(q, day, level=lvl, craft_week=1)[0] for lvl in range(6)}
    assert len(week1) == 1  # level changes the floor, never the phase

    # Each week draws from its own phase — the theory phases before the rep phases.
    phases = {wk: {v[0] for v in quests.craft_phase(wk)} for wk in (1, 4, 7, 9, 12)}
    assert "Foundations · Theory" in phases[1]
    assert "Distributing Data · Theory" in phases[4]
    assert "Distributed Truths · Theory" in phases[7]
    assert "Derived Data · Theory" in phases[9]
    assert "Design Rep · News Feed" in phases[12]
    for wk, titles in phases.items():
        assert quests.content_for(q, day, craft_week=wk)[0] in titles


def test_craft_stays_on_design_reps_past_the_plan():
    """Week 12 is the exit criteria, not a graduation — reps continue after it."""
    for week in (13, 30, 200):
        assert quests.craft_phase(week) is quests.craft_phase(12)


def test_craft_points_at_notes_that_exist_rather_than_a_coding_kata():
    """Every phase variant cites where to read it, and none of it is code-writing."""
    q = _q("d-craft", "CFT", "daily")
    banned = ("solve", "leetcode", "kata", "refactor", "write a test", "repo")
    for week in (1, 3, 6, 9, 11):
        title, _, steps, resource = quests.content_for(q, "2026-07-18", craft_week=week)
        assert resource, title  # always names the page or chapter to read
        joined = " ".join(steps).lower()
        assert not any(word in joined for word in banned), (title, steps)


def test_craft_rotates_within_a_phase_day_to_day():
    q = _q("d-craft", "CFT", "daily")
    seen = {quests.content_for(q, f"2026-07-{d:02d}", craft_week=1)[0] for d in range(1, 29)}
    assert len(seen) > 1  # the same phase, but not the same task every day


def test_systems_reps_land_about_weekly_on_days_craft_is_actually_shown():
    """Architecture is only half of 'system thinking'. The other half needs a real
    system rather than a chapter, so the slot leaves the books regularly.

    Craft is not a daily — `active_daily_ids` rotates it in every 3rd day — so this
    counts only the days it's actually on the board. If that rotation ever changes,
    this is the test that notices."""
    from datetime import date, timedelta

    from app import state

    q = _q("d-craft", "CFT", "daily")
    systems = {v[0] for v in quests._CRAFT_SYSTEMS}
    start = date(2026, 8, 1)
    shown = systems_days = 0
    for offset in range(84):  # 12 weeks
        day = (start + timedelta(days=offset)).isoformat()
        if "d-craft" not in state.active_daily_ids(day):
            continue
        shown += 1
        if quests.content_for(q, day, craft_week=1)[0] in systems:
            systems_days += 1

    assert shown > 20, shown  # Craft really is on the board regularly
    assert systems_days == shown // 3  # exactly every third Craft day
    assert 8 <= systems_days <= 12  # ≈ once a week across 12 weeks


def test_systems_reps_work_on_a_real_system_not_a_chapter():
    """The whole point of this strand: it can't be satisfied by more reading."""
    for title, desc, steps, resource in quests._CRAFT_SYSTEMS:
        joined = " ".join(steps).lower()
        assert "ddia" not in joined and "chapter" not in joined, title
        assert resource  # points back at the capture the framework came from


def test_every_phase_can_land_a_note_in_the_evergreen_shape():
    """Their L7 rule is one atomic idea per note, self-contained and linked back to
    its source — so the note step has to say that, not just 'write a note'."""
    for week in (1, 4, 7, 9, 12):
        notes = [v for v in quests.craft_phase(week) if "Notes" in v[0] or "Missing" in v[0]]
        assert notes, week
        steps = " ".join(notes[0][2]).lower()
        assert "atomic" in steps and "evergreen note" in steps


def test_the_top_floor_rung_asks_for_the_evergreen_note_not_just_a_scribble():
    top = quests.FLOORS["d-craft"][-1][0]
    assert "atomic" in top.lower() and "evergreen" in top.lower()


def test_notes_are_rephrased_never_copy_pasted():
    """L6's rule, and the same principle the Learn tab already asks for."""
    rephrase = [
        v for week in (1, 4, 7, 9) for v in quests.craft_phase(week)
        if "rephrase" in " ".join(v[2]).lower()
    ]
    assert rephrase
    assert all("never copy-pasted" in " ".join(v[2]) for v in rephrase)


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


def test_japanese_plan_advances_by_week():
    hiragana = {t for (t, *_r) in quests._JP_HIRAGANA}
    katakana = {t for (t, *_r) in quests._JP_KATAKANA}
    grammar = {t for (t, *_r) in quests._JP_GRAMMAR}
    kanji = {t for (t, *_r) in quests._JP_KANJI}
    # Week 1 → hiragana (before katakana), week 2 → katakana, week 3 → grammar,
    # week 4+ → kanji & context. Every week-1 pick is hiragana, never katakana.
    for d in ("2026-07-06", "2026-07-07", "2026-07-08", "2026-07-09"):
        assert quests.japanese_content(1, d)[0] in hiragana
    assert quests.japanese_content(2, "2026-07-06")[0] in katakana
    assert quests.japanese_content(3, "2026-07-06")[0] in grammar
    assert quests.japanese_content(9, "2026-07-06")[0] in kanji
    # content_for routes the d-jp daily through the plan and carries a resource.
    q = _q("d-jp", "INT", "daily")
    title, _desc, steps, res = quests.content_for(q, "2026-07-06", jp_week=1)
    assert title in hiragana and steps and res


def test_no_focus_uses_pool():
    q = _q("s-drill", "STR", "side")
    title, desc, _, _ = quests.content_for(q, "2026-07-18", None)
    assert not desc.startswith("Your focus:")
