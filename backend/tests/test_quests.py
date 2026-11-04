"""Unit tests for the deterministic quest generator — no database involved."""

import re
from datetime import date, timedelta

import pytest

from app import japanese, quests, sketch
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
    # A pool slot draws a different variant each day. (Not Creativity any more — that
    # one follows the drawing walk and holds its step until it's finished.)
    q = _q("d-meditate", "SPI", "daily")
    titles = {quests.content_for(q, f"2026-07-{d:02d}")[0] for d in range(10, 25)}
    assert len(titles) > 1  # not the same every day


def test_the_creativity_daily_is_the_drawing_walk():
    """It used to be a wide pool — drawing, music, singing, dance, photo, video — so a
    drawing day could hand you a vocal warm-up. One subject now, held at a position:
    the card is whatever step `Player.sketch_step` is standing on, the same day after
    day until that step is finished."""
    q = _q("d-sketch", "CRE", "daily")
    for step in (0, 4, sketch.LAST_STEP, sketch.LAST_STEP + 50):
        titles = {quests.content_for(q, f"2026-07-{d:02d}", sketch_step=step)[0] for d in range(10, 25)}
        assert titles == {sketch.step_at(step)["title"]}  # the date decides nothing
    title, desc, steps, resource = quests.content_for(q, "2026-07-18", sketch_step=3)
    assert title and steps and resource
    assert sketch.progress(3)["stage_label"] in desc  # the card says where in the walk it is
    assert "d-sketch" not in quests.POOLS  # no pool left to wander back into


def test_daily_floor_is_always_present():
    # The slots that still have a floor lead with it every day, whichever variant
    # the period picked. Physical is not one of them any more — its whole card is
    # the session (see the training-week tests below).
    q = _q("d-meditate", "SPI", "daily")
    floor0 = quests.FLOORS["d-meditate"][0]
    for d in range(10, 25):
        _, _, steps, _ = quests.content_for(q, f"2026-07-{d:02d}")
        assert steps[: len(floor0)] == floor0


def test_floor_climbs_with_level():
    # Higher progression level → a harder floor (progressive overload).
    q = _q("d-meditate", "SPI", "daily")
    floors = quests.FLOORS["d-meditate"]
    assert quests.content_for(q, "2026-07-18", level=0)[2][0] == floors[0][0]
    assert quests.content_for(q, "2026-07-18", level=5)[2][0] == floors[5][0]
    # Beyond the cap it just holds at the top tier — no runaway numbers.
    assert quests.content_for(q, "2026-07-18", level=99)[2][0] == floors[-1][0]


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
    # Grow's method deepens with the level rather than changing subject: read it and
    # take the line away at the bottom, produce and challenge it in the middle, set it
    # against what you already know at the top.
    q = _q("d-read", "INT", "daily")
    low = {quests.content_for(q, f"2026-07-{d:02d}", level=0)[0] for d in range(1, 28)}
    high = {quests.content_for(q, f"2026-07-{d:02d}", level=5)[0] for d in range(1, 28)}
    foundation = {"Deep Page", "One Line That Stuck", "Active Recall"}
    assert low <= foundation  # beginners only ever get the fundamentals
    assert high and not (high & foundation)  # the top band has left them behind


def test_grow_names_one_source_and_only_that():
    """The correction: the card read "Learn How to Learn" over a Coursera chip while
    its first step sent you into a different book entirely — three sittings under one
    title, and one chip that could name only one of them. Craft was fixed this way
    first; Grow now matches it."""
    q = _q("d-read", "INT", "daily")
    book = "Empower Your Momentum — Scott Allan"
    for d in range(1, 29):
        for level in (0, 3, 5):
            day = f"2026-07-{d:02d}"
            _, _, steps, resource = quests.content_for(q, day, book=book, level=level)
            assert book in steps[0]  # the floor names the one source
            assert resource == f"📖 {book}"  # and the chip points at it, not elsewhere
            # No step may send you to a second source.
            for other in ("Coursera", "Khan", "YouTube", "freeCodeCamp", "kana", "Atomic Habits"):
                assert not any(other in st for st in steps[1:]), (other, steps)


def test_grow_methods_never_name_a_source():
    """Same rule as Craft's: a method has to compose with whatever book is in hand,
    so it may point at the hunter's own shelf but never at a title, site or course."""
    named_source = re.compile(r"\b(Coursera|Khan|YouTube|Oakley|Atomic|chapters?|ch)\b", re.I)
    for title, _, steps in quests._READ_METHODS:
        joined = " ".join(steps)
        hit = named_source.search(joined)
        assert hit is None, (title, hit.group(0))
        assert len(steps) == 1  # floor + one method = a sitting, not a checklist
        assert not any(ch.isdigit() for ch in joined), title  # no quota of its own


def test_grow_chip_is_empty_until_there_is_a_book():
    # A chip reading "your current book" points nowhere, so there simply isn't one.
    q = _q("d-read", "INT", "daily")
    assert quests.content_for(q, "2026-07-18")[3] == ""
    assert quests.reading_resource("  ") == ""


def test_resource_matches_variant_title():
    # A learning quest surfaces its trusted source, keyed by the week's variant.
    q = _q("w-tome", "INT", "weekly")
    for d in range(10, 25):
        title, _, _, resource = quests.content_for(q, f"2026-07-{d:02d}")
        assert resource == quests.RESOURCES.get(title, "")


def test_all_resource_keys_exist_as_variant_titles():
    pools = list(quests.POOLS.values()) + list(quests.INTERVIEW_POOLS.values()) + [quests.HANSEI_LENSES]
    titles = {v[0] for pool in pools for v in pool}
    titles |= {session[0] for session in quests.SESSIONS.values()}  # Physical is a program, not a pool
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


@pytest.mark.usefixtures("nothing_parked")
def test_systems_reps_land_exactly_once_a_week_on_a_day_craft_is_shown():
    """Architecture is only half of 'system thinking'. The other half needs a real
    system rather than a page, so the slot leaves the reading regularly.

    The rep sits on a weekday Craft is actually dealt, so it lands once every week
    — no stride to keep in step with a rotation. If Craft's weekdays ever stop
    including the systems weekday, this is the test that notices."""
    from app import state

    q = _q("d-craft", "CFT", "daily")
    systems = {v[0] for v in quests._CRAFT_SYSTEMS}
    start = date(2026, 8, 3)  # a Monday, so the 12 weeks are whole
    shown = systems_days = 0
    for offset in range(84):  # 12 weeks
        day = (start + timedelta(days=offset)).isoformat()
        if "d-craft" not in state.active_daily_ids(day):
            continue
        shown += 1
        if quests.content_for(q, day, craft_source="X")[0] in systems:
            systems_days += 1

    assert shown > 20, shown
    assert systems_days == 12  # exactly one a week, every week


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


def test_japanese_plan_is_held_at_a_position_not_a_date():
    """The plan walks hiragana → katakana → words → sentences → kanji, and where you
    are is a position you finished your way to — never how many weeks have passed."""
    stages = [step["stage"] for step in japanese.PLAN]
    assert stages[0] == japanese.HIRAGANA
    assert stages[-1] == japanese.KANJI
    # Each stage runs contiguously, in the beginner order, and none is skipped.
    order = [s for n, s in enumerate(stages) if n == 0 or stages[n - 1] != s]
    assert order == [japanese.HIRAGANA, japanese.KATAKANA, japanese.WORDS,
                     japanese.SENTENCES, japanese.KANJI]
    # Hiragana comes before katakana on purpose: every particle is written in it.
    assert stages.index(japanese.KATAKANA) > stages.index(japanese.HIRAGANA)


def test_japanese_stops_to_read_back_every_few_rows():
    """A chart shown one row at a time is not a chart you can read straight through,
    and reading it straight through is the only thing that proves the early rows stuck.
    So consolidation is a step in the plan, not a mood the plan is sometimes in."""
    kana = [n for n, s in enumerate(japanese.PLAN) if s["stage"] == japanese.HIRAGANA]
    holds = [n for n in kana if "read" in japanese.PLAN[n]["title"].lower()
             or "chart" in japanese.PLAN[n]["title"].lower()]
    assert len(holds) == 3
    # Never two holds running, and never more than five new rows without one.
    runs = []
    since = 0
    for n in kana:
        if n in holds:
            runs.append(since)
            since = 0
        else:
            since += 1
    assert all(0 < r <= 6 for r in runs)


def test_every_appearance_of_the_quest_moves_the_plan():
    """The quest is already on the three-day rotation, so its own spacing is the
    rotation's. A second cadence on top put the two cycles permanently out of phase —
    the quest only came up on days the plan had set aside for drilling."""
    assert japanese.next_position(3) == 4
    assert japanese.next_position(0) == 1
    # Held at the last step rather than running out: the tail is reading real Japanese.
    assert japanese.next_position(japanese.LAST_STEP) == japanese.LAST_STEP


def test_japanese_content_routes_through_content_for():
    q = _q("d-jp", "INT", "daily")
    title, desc, steps, res = quests.content_for(q, "2026-07-06", jp_step=6)
    assert title == japanese.step_at(6)["title"] and steps and res
    # The card always says where the plan is, so a hold day doesn't read as a
    # plan-less drill and a row day doesn't read as the whole of Japanese.
    assert desc.endswith("Hiragana 7/14")


def test_no_focus_uses_pool():
    q = _q("s-drill", "STR", "side")
    title, desc, _, _ = quests.content_for(q, "2026-07-18", None)
    assert not desc.startswith("Your focus:")


def _train_card(day: str, level: int = 1, training: str = "") -> tuple[str, list[str]]:
    """What the Physical card actually shows on `day` — content plus the slot's cap,
    the same pairing state.resolve_content applies."""
    q = _q("d-train", "STR", "daily")
    title, _, steps, _ = quests.content_for(q, day, level=level, training=training)
    floor = quests.floor_for(q, level=level)
    return title, quests.cap_steps(steps, len(floor), "d-train")


def test_the_training_week_deals_push_pull_legs_and_the_court():
    # The split the hunter actually runs: push Monday, pull Wednesday, legs Friday,
    # and badminton on the four days between. Weekday-keyed, so the same Monday
    # every Monday rather than a rotation that drifts.
    expected = ["Push Day", "Court Session", "Pull Day", "Court Session",
                "Leg Day", "Court Session", "Court Session"]
    for i in range(28):
        d = date(2026, 8, 24) + timedelta(days=i)  # a Monday
        title, _ = _train_card(d.isoformat())
        assert title == expected[d.weekday()]


def test_a_physical_card_is_never_shorter_than_six_or_longer_than_eight():
    # Six program movements, then nought to two accessories behind them — and the
    # cap has to be wide enough to let all eight through (STEP_CAPS).
    lengths = set()
    for i in range(60):
        day = (date(2026, 8, 24) + timedelta(days=i)).isoformat()
        for session in quests.SESSION_KEYS:
            _, steps = _train_card(day, training=session)
            assert 6 <= len(steps) <= 8
            assert len(set(steps)) == len(steps)  # no movement dealt twice
            lengths.add(len(steps))
    assert lengths == {6, 7, 8}  # all three lengths actually occur


def test_the_six_program_movements_lead_every_session():
    # The accessories rotate; the program doesn't. Whatever the day, the first six
    # lines are the hunter's own six lifts in their own order.
    for session, (_, _, core, _) in quests.SESSIONS.items():
        for i in range(14):
            day = (date(2026, 8, 24) + timedelta(days=i)).isoformat()
            _, steps = _train_card(day, training=session)
            assert [s.split(" — ")[0] for s in steps[:6]] == [lift[0] for lift in core]


def test_training_volume_climbs_with_level():
    # The old leveled floor's job, moved into the lifts: sets × reps grow with the
    # level, and hold at the cap rather than running away.
    def bench(level: int) -> str:
        _, steps = _train_card("2026-08-24", level=level, training="push")
        return steps[0]

    assert "3 × 8" in bench(0)
    assert "5 × 10" in bench(5)
    assert bench(99) == bench(5)
    # Never a habit-sized set: the lightest tier is still working volume.
    assert all(" × " in s for s in _train_card("2026-08-24", level=0, training="push")[1])


def test_the_session_is_stable_through_the_day_and_varies_across_them():
    # A card can't reshuffle underneath a half-ticked session, and the accessories
    # behind the program still have to change day to day or it's one checklist.
    day = "2026-08-25"
    assert _train_card(day) == _train_card(day)
    cards = {tuple(_train_card((date(2026, 8, 24) + timedelta(days=i)).isoformat(),
                               training="court")[1]) for i in range(21)}
    assert len(cards) > 1


def test_the_day_can_be_told_it_is_a_different_session():
    # The weekday is a default, not a rule — the court was booked out, so Monday is
    # legs. An unknown answer falls back rather than dealing an empty card.
    assert quests.default_session("2026-08-24") == "push"
    assert quests.session_for("2026-08-24") == "push"
    assert quests.session_for("2026-08-24", "legs") == "legs"
    assert quests.session_for("2026-08-24", "yoga") == "push"
    assert _train_card("2026-08-24", training="legs")[0] == "Leg Day"


def test_other_slots_keep_the_lean_three_step_cap():
    # Raising Physical's cap must not bloat the rest — a floored slot is a plan,
    # not a checklist.
    steps = ["a", "b", "c", "d", "e", "f", "g", "h", "i"]
    assert len(quests.cap_steps(steps, 2, "d-craft")) == 3
    assert len(quests.cap_steps(steps, 1, "d-read")) == 3
    assert len(quests.cap_steps(steps, 0, "d-sketch")) == 2  # floor-free slots stay at 2
    assert len(quests.cap_steps(steps, 0, "d-train")) == 8


def test_every_movement_names_a_scheme_that_exists():
    # A typo in a scheme key would be a KeyError on the card rather than at import,
    # and only on the day that movement came up.
    for _, _, core, extra in quests.SESSIONS.values():
        for name, scheme, cue in core + extra:
            assert scheme in quests.SCHEMES, (name, scheme)
            assert name and cue


def test_generated_content_cannot_replace_a_plan():
    """The guard `state.resolve_content` applies: Physical is the one thing the card
    asked the hunter and drawing is a walk held at a position, so LLM-generated variety
    must not quietly answer either. A pool slot still takes generated content."""
    from app import state

    train = _q("d-train", "STR", "daily")
    draw = _q("d-sketch", "CRE", "daily")
    sit = _q("d-meditate", "SPI", "daily")
    gen = {"title": "Invented Workout", "desc": "d", "steps": ["something else"], "resource": ""}

    def resolve(quest, day: str) -> str:
        pk = quests.period_key("daily", day)
        return state.resolve_content(
            quest, day, prefs={}, gen_by={(quest.id, pk): gen}, level=1, book="",
            interview=False, jp_step=0, craft_source="",
        )[0]

    assert resolve(train, "2026-08-24") == "Push Day"       # Monday — the plan holds
    assert resolve(train, "2026-08-25") == "Court Session"  # and so does Tuesday
    assert resolve(draw, "2026-08-25") == sketch.step_at(0)["title"]  # the step it's on
    assert resolve(sit, "2026-08-25") == "Invented Workout"  # a pool slot still generates


def test_finishing_a_japanese_day_moves_the_plan_and_undo_puts_it_back(db):
    """The plan advances because a step got finished, not because a day passed — and a
    mis-tap costs nothing, or a fumbled tick would eat a row of the chart."""
    from app import service
    from app.state import get_or_create_player

    player = get_or_create_player(db)
    player.japanese_step = 5
    db.commit()

    service.complete_quest(db, player, "d-jp", "2026-07-06")
    assert player.japanese_step == 6

    done = [c for c in service.completions_of(db, player) if c.quest_id == "d-jp"]
    service.undo_completion(db, player, done[-1].id, "2026-07-06")
    assert player.japanese_step == 5


def test_a_kana_row_is_served_whole():
    """The two-step cap keeps a quest glanceable, and a kana row is the one shape where
    the steps *are* the material — the H row trimmed to two loses its handakuten, which
    is a chart with five characters missing rather than a lean quest."""
    row = japanese.step_at(6)
    assert row["title"] == "Hiragana: H row"
    assert len(row["steps"]) == 5
    # No floor on d-jp, so this is the bare path — the per-slot exception has to apply
    # there too, or the cap silently eats the row.
    assert quests.cap_steps(list(row["steps"]), 0, "d-jp") == list(row["steps"])
    assert any("ぱ" in s for s in quests.cap_steps(list(row["steps"]), 0, "d-jp"))
    # Everything else still gets the lean two.
    assert len(quests.cap_steps(["a", "b", "c"], 0, "d-sketch")) == 2


def test_a_kana_row_sends_you_somewhere_it_actually_lives():
    """Every row ends by asking you to retrieve it, and where depends on the script:
    hiragana has the stack on Learn, katakana has the loanwords it exists for. A
    katakana row pointed at the Hiragana stack is a pile that holds none of it."""
    hira = japanese.step_at(6)   # Hiragana: H row
    kata = japanese.step_at(20)  # Katakana: H row
    assert "Hiragana stack" in hira["steps"][-1]
    assert "Hiragana stack" not in kata["steps"][-1]
    assert "loanwords" in kata["steps"][-1]


def test_index_cards_always_lead_with_the_pile():
    """Whatever method the day picks, the first step is the pile itself.

    The slot's variants are ways of *working* a card (out loud, cold, in fewer
    words) — none of them is the reason the card is on the board. If a variant ever
    became step one, a morning could be spent rewriting one card's back while the
    ones the ladder actually brought back went untouched."""
    q = _q("d-recall", "INT", "daily")
    start = date(2026, 8, 3)
    titles = set()
    for offset in range(30):
        day = (start + timedelta(days=offset)).isoformat()
        title, desc, steps, _ = quests.content_for(q, day, level=offset % 6)
        assert steps[0] == quests.FLOORS["d-recall"][0][0], day
        assert len(steps) == 2, day  # the floor, then the day's method — nothing else
        assert title and desc
        titles.add(title)
    assert len(titles) > 1  # the method still rotates


def test_the_index_card_floor_does_not_climb_with_level():
    """The Leitner ladder is what makes recall harder over time (recall.py). A floor
    that also climbed would be asking more of the same cards on the same morning."""
    q = _q("d-recall", "INT", "daily")
    assert {quests.floor_for(q, level=lvl)[0] for lvl in range(8)} == {quests.FLOORS["d-recall"][0][0]}


def test_index_cards_are_worked_where_the_app_keeps_them():
    """The floor names the surface. A card that says "review your cards" without
    saying where sends you looking, and the pile lives in exactly one place."""
    assert "Learn" in quests.FLOORS["d-recall"][0][0]


def test_no_index_card_variant_borrows_a_band_from_another_slot():
    """TIER is keyed by title across every pool, so a title reused from another slot
    would silently inherit its band and drop out of the pool at low levels. These
    are all band 0 on purpose: the spacing carries the difficulty, not the wording."""
    for title, _, _ in quests.POOLS["d-recall"]:
        assert quests.TIER.get(title, 0) == 0, title
    assert len(quests.narrow_to_band(quests.POOLS["d-recall"], 2)) == len(quests.POOLS["d-recall"])


def test_hansei_walks_every_lens_once_in_six_evenings():
    """Each principle comes round once every six days — a fixed cycle, not a hash
    that repeats one and skips another — opening on plain Hansei the day it arrived."""
    q = _q("d-hansei", "SPI", "daily")
    start = date(2026, 9, 23)
    titles = [quests.content_for(q, (start + timedelta(days=i)).isoformat())[0] for i in range(12)]
    assert titles[0] == "Hansei"
    assert sorted(titles[:6]) == sorted(t for t, _, _ in quests.HANSEI_LENSES)
    assert titles[6:] == titles[:6]


def test_every_hansei_lens_ends_on_tomorrows_change_and_keeps_it():
    """The third step is the change the next evening reads back — so every lens has
    one there, and the bare-slot step cap can't trim it off the card."""
    q = _q("d-hansei", "SPI", "daily")
    for i in range(len(quests.HANSEI_LENSES)):
        day = (date(2026, 9, 23) + timedelta(days=i)).isoformat()
        _, _, steps, _ = quests.content_for(q, day)
        steps = quests.cap_steps(steps, 0, "d-hansei")
        assert len(steps) == 3, steps
        assert "tomorrow" in steps[quests.HANSEI_CHANGE_STEP].lower(), steps
