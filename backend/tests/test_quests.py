"""Unit tests for the deterministic quest generator — no database involved."""

import re
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
    assert "3 × 10 push-ups" in lv0[0] and "5 × 20 push-ups" in lv5[0]
    # Beyond the cap it just holds at the top tier — no runaway numbers.
    assert quests.content_for(q, "2026-07-18", level=99)[2][: len(floors[-1])] == floors[-1]


def _fuel_targets() -> dict:
    # The shape nutrition.targets returns, with easy-to-spot numbers.
    return {"protein_g": 137, "target_low": 2066, "target_high": 2266, "fibre_g": 30}


def test_fuel_floor_is_written_from_the_hunters_own_targets():
    # The diet quest is *my* plan, not advice: the floor carries the numbers the
    # body profile computed. Logging is always step one.
    floor = quests.fuel_floor(_fuel_targets(), 0)
    assert len(floor) == 2
    assert "Log" in floor[0] and "Food screen" in floor[0]
    assert "137 g" in floor[1]


def test_fuel_floor_climbs_by_adding_marks_not_harshness():
    # Protein first; the calorie band joins mid-climb; fibre at the top. The band
    # stays a range to land inside, never a single number to fail at.
    t = _fuel_targets()
    lv0, lv2, lv3 = quests.fuel_floor(t, 0), quests.fuel_floor(t, 2), quests.fuel_floor(t, 3)
    assert "kcal" not in lv0[1]
    assert "2066–2266 kcal" in lv2[1]
    assert "fibre ≥ 30 g" in lv3[1]
    # Beyond the cap it holds at the top tier.
    assert quests.fuel_floor(t, 99) == quests.fuel_floor(t, 5)


def test_fuel_floor_without_a_profile_asks_for_one():
    # No profile → no real numbers, so the floor's first job is to send you to set
    # one up rather than inventing targets.
    floor = quests.fuel_floor(None, 3)
    assert "body profile" in floor[0]
    assert not any(ch.isdigit() for ch in floor[0])


def test_fuel_daily_is_floor_plus_one_rotating_habit():
    # Two floor steps + at most one variant step — a plan, not a checklist.
    q = _q("d-fuel", "STR", "daily")
    floor = quests.fuel_floor(_fuel_targets(), 0)
    titles = set()
    for d in range(10, 25):
        title, _, steps, _ = quests.content_for(q, f"2026-07-{d:02d}", fuel=_fuel_targets())
        steps = quests.cap_steps(steps, len(floor))
        assert steps[: len(floor)] == floor  # the targets lead every day
        assert len(steps) == 3
        titles.add(title)
    assert len(titles) > 1  # the habit on top still rotates


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


def test_craft_names_one_source_and_only_that(client_free=None):
    """The correction: a quest that named a DDIA chapter, a case study and an Xu rep
    in the same three steps was a scavenger hunt. The reading loop names one book and
    lets you get on with it; this now does the same."""
    q = _q("d-craft", "CFT", "daily")
    source = "DDIA ch 5 — Replication"
    for d in range(1, 29):
        day = f"2026-07-{d:02d}"
        _, _, steps, _ = quests.content_for(q, day, craft_source=source)
        if steps[0].startswith("Pick"):
            continue
        systems = {v[0] for v in quests._CRAFT_SYSTEMS}
        if quests.content_for(q, day, craft_source=source)[0] in systems:
            continue  # the systems rep works on a real system, not a source
        assert source in steps[0], steps
        # No step may send you to a second source.
        for other in ("Airbnb", "Xu", "master doc", "anchor", "ch 1–2", "Spotify"):
            assert not any(other in st for st in steps), (other, steps)


def test_craft_floor_names_the_source_and_sets_no_quota():
    source = "Ch 6 — Design a Key-Value Store"
    lv0 = quests.craft_floor(source, 0)
    lv5 = quests.craft_floor(source, 5)
    assert source in lv0 and source in lv5
    assert "at your pace" in lv0
    assert not any(ch.isdigit() for ch in lv0.replace(source, ""))  # no counts of its own
    assert "cold" in lv5  # the top rung asks you to produce it, not recognise it


def test_with_nothing_set_it_asks_you_to_pick_rather_than_picking_for_you():
    floor = quests.craft_floor("", 0)
    assert floor.startswith("Pick what you're studying")
    assert "System design" in floor  # says where


def test_craft_methods_never_name_a_source():
    """Every variant varies the *method*, so it composes with whatever you're holding.
    A method that named its own material would put you back in a scavenger hunt."""
    named_source = re.compile(r"\b(DDIA|Xu|chapters?|ch|anchor|vol)\b|Notion ·", re.I)
    for title, desc, steps, _ in quests._CRAFT_METHODS:
        joined = " ".join(steps)
        hit = named_source.search(joined)
        assert hit is None, (title, hit.group(0))
        assert len(steps) == 1  # floor + one method = a sitting, not a checklist


def test_the_top_floor_rung_asks_for_the_evergreen_note():
    top = quests.craft_floor("Something", 5)
    assert "atomic" in top.lower() and "evergreen" in top.lower()


def test_the_evergreen_method_carries_the_l6_rule():
    method = next(v for v in quests._CRAFT_METHODS if v[0] == "Evergreen It")
    joined = " ".join(method[2])
    assert "never copy-pasted" in joined and "atomic" in joined


def test_craft_rotates_the_method_day_to_day():
    q = _q("d-craft", "CFT", "daily")
    seen = {quests.content_for(q, f"2026-07-{d:02d}", craft_source="X")[0] for d in range(1, 29)}
    assert len(seen) > 1


def test_systems_reps_land_about_weekly_on_days_craft_is_actually_shown():
    """Architecture is only half of 'system thinking'. The other half needs a real
    system rather than a page, so the slot leaves the reading regularly.

    Craft is not a daily — `active_daily_ids` rotates it in every 3rd day — so this
    counts only the days it's actually on the board. If that rotation ever changes,
    this is the test that notices."""
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
        if quests.content_for(q, day, craft_source="X")[0] in systems:
            systems_days += 1

    assert shown > 20, shown
    assert systems_days == shown // 3
    assert 8 <= systems_days <= 12


def test_a_systems_day_is_the_whole_sitting():
    """No reading floor bolted onto a whiteboard exercise — that would split one
    sitting across two places, which is the thing being fixed."""
    q = _q("d-craft", "CFT", "daily")
    source = "DDIA ch 5 — Replication"
    start = date(2026, 8, 1)
    checked = 0
    for offset in range(30):
        day = (start + timedelta(days=offset)).isoformat()
        if not quests.is_systems_day(day):
            continue
        _, _, steps, _ = quests.content_for(q, day, craft_source=source)
        assert not any(source in st for st in steps), steps
        assert not any(st.startswith("Read ") for st in steps), steps
        checked += 1
    assert checked > 0


def test_systems_reps_work_on_a_real_system_not_a_page():
    for title, desc, steps, resource in quests._CRAFT_SYSTEMS:
        joined = " ".join(steps).lower()
        assert "ddia" not in joined and "chapter" not in joined, title
        assert resource


def test_every_phase_names_what_it_is_made_of():
    """The phases are guidance for what to pick next, so each needs a label, what it
    covers, and the pieces themselves — the card hands you the next one by name, so an
    empty or unnamed piece would leave it with nothing to offer."""
    for info in quests.CRAFT_PHASES:
        assert info["label"] and info["detail"]
        assert info["plan"] and all(piece.strip() for piece in info["plan"])


def test_a_phase_hands_over_its_pieces_in_order_then_stops():
    """Walking off the end returns "" rather than raising: that state is how the card
    knows the phase is covered and the check-in is due."""
    plan = quests.craft_phase_info(1)["plan"]
    assert quests.craft_piece_at(1, 0) == plan[0]
    assert quests.craft_piece_at(1, len(plan) - 1) == plan[-1]
    assert quests.craft_piece_at(1, len(plan)) == ""
    assert quests.craft_piece_at(1, -1) == ""


def test_the_last_phase_has_nothing_after_it():
    last = quests.craft_phase_info(quests.LAST_CRAFT_PHASE)
    for beyond in (6, 12, 200):
        assert quests.craft_phase_info(beyond) is last
    assert quests.craft_phase_info(0) is quests.craft_phase_info(1)


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


def _train_card(day: str, level: int = 1) -> tuple[str, list[str]]:
    """What the Physical card actually shows on `day` — content plus the slot's cap,
    the same pairing state.resolve_content applies."""
    q = _q("d-train", "STR", "daily")
    title, _, steps, _ = quests.content_for(q, day, level=level)
    floor = quests.floor_for(q, level=level)
    return title, quests.cap_steps(steps, len(floor), "d-train")


def test_physical_shows_the_days_training_and_not_just_the_floor():
    # The regression this guards: d-train's floor is three steps on its own, so at
    # the default cap of 3 the floor ate the whole budget and every variant was
    # built and then trimmed away — a rotating title over an identical checklist.
    floor = quests.floor_for(_q("d-train", "STR", "daily"), level=1)
    assert len(floor) == 3
    checklists = set()
    for i in range(21):
        day = (date(2026, 8, 25) + timedelta(days=i)).isoformat()
        _, steps = _train_card(day)
        assert steps[: len(floor)] == floor  # non-negotiables still lead
        assert len(steps) == 5  # floor + two steps of real work
        assert steps[len(floor):] != []
        checklists.add(tuple(steps))
    assert len(checklists) > 1  # the work below the floor actually changes


def test_roadwork_lands_on_every_mon_wed_fri_and_keeps_the_floor():
    floor = quests.floor_for(_q("d-train", "STR", "daily"), level=1)
    for i in range(60):
        d = date(2026, 8, 24) + timedelta(days=i)
        title, steps = _train_card(d.isoformat())
        is_mwf = d.weekday() in (0, 2, 4)
        assert (title == "Roadwork") is is_mwf
        if is_mwf:
            # The run replaces the rotating variant, never the floor.
            assert steps[: len(floor)] == floor
            assert any("5 km run" in s for s in steps)


def test_other_slots_keep_the_lean_three_step_cap():
    # Raising Physical's cap must not bloat the rest — Fuel is a plan, not a checklist.
    steps = ["a", "b", "c", "d", "e", "f"]
    assert len(quests.cap_steps(steps, 2, "d-fuel")) == 3
    assert len(quests.cap_steps(steps, 1, "d-read")) == 3
    assert len(quests.cap_steps(steps, 0, "d-sketch")) == 2  # floor-free slots stay at 2
    assert len(quests.cap_steps(steps, 3, "d-train")) == 5


def test_hips_and_hamstrings_complements_the_running_days():
    # Running is quad/calf dominant in one plane; the complement is unilateral
    # posterior-chain work, and it has to lead the variant to survive the cap.
    variant = next(v for v in quests.POOLS["d-train"] if v[0] == "Hips & Hamstrings")
    assert "single-leg RDL" in variant[2][0]
    assert "split squat" in variant[2][1]


def test_generated_content_cannot_replace_a_run_day():
    """The guard `state.resolve_content` applies: on Mon/Wed/Fri the Physical slot
    is a plan, so LLM-generated variety must not quietly swap the 5 km out. Any
    other day, generated content wins as usual."""
    from app import state

    q = _q("d-train", "STR", "daily")
    gen = {"title": "Invented Workout", "desc": "d", "steps": ["something else"], "resource": ""}

    def resolve(day: str) -> str:
        pk = quests.period_key("daily", day)
        return state.resolve_content(
            q, day, prefs={}, gen_by={("d-train", pk): gen}, level=1, book="",
            interview=False, jp_week=0, craft_source="",
        )[0]

    assert resolve("2026-08-24") == "Roadwork"          # Monday — the plan holds
    assert resolve("2026-08-26") == "Roadwork"          # Wednesday
    assert resolve("2026-08-25") == "Invented Workout"  # Tuesday — generation still wins
