"""Integration tests: the HTTP API end to end, against a throwaway database."""

from app import quests

DAY = "2026-07-18"
DAILY_IDS = ["d-train", "d-sketch", "d-meditate", "d-connect", "d-read", "d-jp", "d-wealth", "d-craft"]


def _state(client):
    r = client.get(f"/state?day={DAY}")
    assert r.status_code == 200, r.text
    return r.json()


def _quest(state, qid):
    return next(q for q in state["quests"] if q["id"] == qid)


def test_read_and_write_paths_resolve_identical_steps(client):
    """The steps the client renders (read model) must equal the steps the
    step-toggle write path validates a tick against — if they drift, a ticked
    index maps to a different displayed step. This guards the shared resolver."""
    from app import state as state_mod
    from app.db import SessionLocal

    s = _state(client)
    with SessionLocal() as db:
        player = state_mod.get_or_create_player(db)
        defs = {q.id: q for q in state_mod.quest_defs(db)}
        checked = 0
        for q in s["quests"]:
            quest = defs[q["id"]]
            if quest.target != 1:
                continue  # the step checklist only applies to single-completion quests
            assert state_mod.resolve_steps(db, player, quest, DAY) == q["steps"], q["id"]
            checked += 1
        assert checked > 0  # we actually exercised some quests


def test_state_shape(client):
    s = _state(client)
    for key in ("player", "stats", "streak", "today", "book_review", "preferences", "quests", "achievements", "record"):
        assert key in s
    # Dailies rotate — Physical every day plus one group — so not all 8 show at once.
    from app.state import active_daily_ids

    shown_daily = {q["id"] for q in s["quests"] if q["cadence"] == "daily"}
    assert shown_daily == active_daily_ids(DAY) and "d-train" in shown_daily
    assert {st["key"] for st in s["stats"]} == {"STR", "CRE", "SPI", "CHA", "INT", "WLT", "CFT"}
    q = _quest(s, "d-train")
    assert "steps" in q and "steps_done" in q and "resource" in q
    assert len(q["steps"]) == len(q["steps_done"])
    # The physical daily always carries its non-negotiable floor (Lv0 → 5 push-ups).
    assert "push-ups" in q["steps"][0]
    # …and an explosive (plyometric) core rep is always on top, whatever the workout.
    assert any("tuck jump" in st for st in q["steps"])
    # Quests stay lean: ≤3 steps when there's a mandatory floor, ≤2 without one.
    assert len(q["steps"]) <= 3
    # A non-floored daily (Creativity) caps at 2 — checked on a day it's in rotation.
    sketch = _quest(client.get("/state?day=2026-07-19").json(), "d-sketch")
    assert sketch and len(sketch["steps"]) <= 2
    # The Grow daily always opens with reading (the mandatory floor).
    assert _quest(s, "d-read")["steps"][0].startswith("Read your current book")
    # Craft opens by studying the system-design notes, and a new player starts at
    # week 1 of the plan — foundations, not a coding drill.
    assert "Notion" in _quest(s, "d-craft")["steps"][0]
    assert _quest(s, "d-craft")["title"] in {v[0] for v in quests.craft_phase(1)}
    assert s["player"]["interview_mode"] is False
    assert s["player"]["total_xp"] == 0
    # Progression starts everyone at Lv0 with a permanent peak of 0.
    assert set(s["progression"]) == {"STR", "CRE", "SPI", "CHA", "INT", "WLT", "CFT"}
    assert s["progression"]["STR"]["level"] == 0
    assert s["progression"]["STR"]["peak"] == 0
    assert s["progression"]["STR"]["required"] == 3  # 3 days to earn the first level


def test_reading_review_flow(client):
    # Set a book — no review the same week it started.
    r = client.put("/book?day=2026-07-18", json={"current_book": "Atomic Habits"})
    body = r.json()
    assert body["player"]["current_book"] == "Atomic Habits"
    assert body["book_review"]["pending"] is False
    assert _quest(body, "d-read")["steps"][0] == "Read Atomic Habits at your pace, then log which chapters"
    # A week ending never resets the book: with no reading done, no review — the
    # book simply carries on into the next week with its progress intact.
    nxt = "2026-07-27"  # a Monday in the following ISO week
    later = client.get(f"/state?day={nxt}").json()
    assert later["book_review"]["pending"] is False
    assert later["player"]["current_book"] == "Atomic Habits"
    # The check-in appears only once you've put in the reading days to finish at
    # your pace (14 days at reading level 0). Log the reading daily 14 days running.
    days = [f"2026-07-{d:02d}" for d in range(18, 32)]  # 18–31 Jul = 14 distinct days
    assert len(days) == 14
    for d in days:
        client.post("/completions", json={"quest_id": "d-read", "day": d})
    last = days[-1]
    st = client.get(f"/state?day={last}").json()
    assert st["reading"]["progress"] >= 1.0
    assert st["book_review"]["pending"] is True
    # Finish it → counts, rolls to the next book, and stops asking this week.
    r = client.post(f"/book/review?day={last}", json={"finished": True, "next_book": "Deep Work"})
    body = r.json()
    assert body["player"]["books_finished"] == 1
    assert body["player"]["current_book"] == "Deep Work"
    assert body["book_review"]["pending"] is False


def test_interview_mode_toggles_craft_quests(client):
    s = _state(client)
    assert s["player"]["interview_mode"] is False
    interview_titles = {"Behavioural Prep", "Mock Interview", "Mock System Design"}
    assert _quest(s, "w-craft")["title"] not in interview_titles  # pools are disjoint
    # Turn it on → the player flag flips and Craft shifts to interview prep.
    body = client.put(f"/interview?day={DAY}", json={"enabled": True}).json()
    assert body["player"]["interview_mode"] is True
    assert _quest(body, "w-craft")["title"] in interview_titles
    # The daily still opens with its floor, then an interview drill — and interview
    # mode opts out of the 12-week plan, which isn't what next week's interview needs.
    assert "Notion" in _quest(body, "d-craft")["steps"][0]
    assert _quest(body, "d-craft")["title"] in {
        "Daily DSA", "Explain Your Solution", "Pattern of the Day", "Behavioural Prep",
        "Mock Interview", "Mock System Design", "Flashcard Fundamentals", "Timed Set",
    }
    # Turning it off restores steady craft growth.
    off = client.put(f"/interview?day={DAY}", json={"enabled": False}).json()
    assert off["player"]["interview_mode"] is False
    assert _quest(off, "w-craft")["title"] not in interview_titles


def test_llm_off_by_default_and_generate_is_noop(client):
    s = _state(client)
    assert s["llm_enabled"] is False
    # With no key, generation is a safe no-op that returns the pool-based state.
    r = client.post("/quests/generate?day=" + DAY)
    assert r.status_code == 200, r.text
    assert _quest(r.json(), "d-read")["title"] == _quest(s, "d-read")["title"]


def test_generated_content_overrides_pool_but_keeps_floor(client):
    import json as _json

    from app.db import SessionLocal
    from app.models import GeneratedQuest, Player

    _state(client)  # ensure the player exists
    session = SessionLocal()
    pid = session.query(Player).first().id
    session.add(
        GeneratedQuest(
            player_id=pid, quest_id="d-read", period_key=DAY,
            title="Personalised Study", desc="Tuned to you",
            steps=_json.dumps(["Do the custom thing", "And one more"]), resource="🎥 Example",
        )
    )
    session.commit()
    session.close()

    q = _quest(_state(client), "d-read")
    assert q["title"] == "Personalised Study"
    assert q["resource"] == "🎥 Example"
    assert "Do the custom thing" in q["steps"]
    # The mandatory reading floor is still re-applied on top of LLM content.
    assert q["steps"][0].startswith("Read your current book")


def test_levels_roundtrip_and_survive_focus_clear(client):
    r = client.put(f"/preferences?day={DAY}", json={"levels": {"INT": "Math: fractions"}})
    assert r.json()["levels"]["INT"] == "Math: fractions"
    # Setting a focus for the same stat keeps the level.
    r = client.put(f"/preferences?day={DAY}", json={"preferences": {"INT": ["coding"]}})
    body = r.json()
    assert body["levels"]["INT"] == "Math: fractions"
    assert body["preferences"]["INT"] == ["coding"]
    # Clearing the focus keeps the level (row survives on the level alone).
    r = client.put(f"/preferences?day={DAY}", json={"preferences": {"INT": []}})
    assert r.json()["levels"]["INT"] == "Math: fractions"


def test_complete_then_conflict(client):
    r = client.post("/completions", json={"quest_id": "d-train", "day": DAY})
    assert r.status_code == 200, r.text
    assert r.json()["state"]["player"]["total_xp"] == 10
    # Completing again in the same period is rejected.
    r2 = client.post("/completions", json={"quest_id": "d-train", "day": DAY})
    assert r2.status_code == 409


def test_undo_completion(client):
    client.post("/completions", json={"quest_id": "d-train", "day": DAY})
    undo_id = _quest(_state(client), "d-train")["undoable_id"]
    assert undo_id
    r = client.request("DELETE", f"/completions/{undo_id}?day={DAY}")
    assert r.status_code == 200, r.text
    assert _quest(r.json()["state"], "d-train")["done"] == 0
    assert r.json()["state"]["player"]["total_xp"] == 0


def test_step_checklist_autocompletes_and_reverses(client):
    steps = _quest(_state(client), "d-train")["steps"]
    n = len(steps)
    last = None
    for i in range(n):
        last = client.post("/steps", json={"quest_id": "d-train", "step_index": i, "day": DAY}).json()
        expected = i == n - 1
        assert last["completed"] is expected
    st = _quest(last["state"], "d-train")
    assert st["done"] == 1
    assert last["state"]["player"]["total_xp"] == 10
    # Unticking the last step reverses the completion.
    r = client.post("/steps", json={"quest_id": "d-train", "step_index": n - 1, "day": DAY}).json()
    assert r["completed"] is False
    assert _quest(r["state"], "d-train")["done"] == 0
    assert r["state"]["player"]["total_xp"] == 0


def test_daily_rotation(client):
    from app.state import active_daily_ids

    # Physical shows every day; the other dailies rotate over a 3-day cycle.
    seen = []
    for d in ("2026-07-18", "2026-07-19", "2026-07-20"):
        shown = {q["id"] for q in client.get(f"/state?day={d}").json()["quests"] if q["cadence"] == "daily"}
        assert "d-train" in shown and shown == active_daily_ids(d)
        seen.append(shown)
    assert seen[0] != seen[1] != seen[2]  # the daily set changes day to day
    # Across the full cycle every daily comes around.
    assert set().union(*seen) == {
        "d-train", "d-read", "d-wealth", "d-craft", "d-sketch", "d-jp", "d-meditate", "d-connect",
    }


def test_step_toggle_rejected_for_multi_target(client):
    # No seeded quest is multi-target now (the badminton weekly is a single-session
    # checklist), so insert one to prove step-toggling is still rejected for them.
    from app.db import SessionLocal
    from app.models import QuestDef

    s = SessionLocal()
    s.add(QuestDef(id="w-multi", title="Multi", desc="", stat="STR", xp=10,
                   cadence="weekly", target=3, sort=99))
    s.commit()
    s.close()
    r = client.post("/steps", json={"quest_id": "w-multi", "step_index": 0, "day": DAY})
    assert r.status_code == 400


def test_badminton_weekly_is_single_checklist(client):
    # The physical weekly is a single-session checklist (target 1), so its steps
    # tick like the other weeklies rather than being tap-to-log guidance.
    q = _quest(_state(client), "w-badminton")
    assert q["target"] == 1 and len(q["steps"]) > 0
    r = client.post("/steps", json={"quest_id": "w-badminton", "step_index": 0, "day": DAY})
    assert r.status_code == 200


def test_daily_clear_bonus(client):
    events = []
    for qid in DAILY_IDS:
        events = client.post("/completions", json={"quest_id": qid, "day": DAY}).json()["events"]
    assert any(e["type"] == "daily_clear" for e in events)
    # every daily × 10 + 15 clear bonus
    assert _state(client)["player"]["total_xp"] == len(DAILY_IDS) * 10 + 15
    assert _state(client)["today"]["cleared"] is True


def test_rest_day_keeps_streak(client):
    r = client.post(f"/rest?day={DAY}").json()
    assert r["today"]["resting"] is True
    assert r["streak"]["current"] == 1
    assert r["today"]["xp"] == 0
    # Toggling off clears it.
    r2 = client.post(f"/rest?day={DAY}").json()
    assert r2["today"]["resting"] is False


def test_preferences_roundtrip_and_side_quest(client):
    r = client.put(
        f"/preferences?day={DAY}",
        json={"preferences": {"STR": ["smash footwork", "backhand"]}},
    )
    assert r.status_code == 200, r.text
    assert r.json()["preferences"]["STR"] == ["smash footwork", "backhand"]
    # The STR side quest is now themed by the focus.
    assert _quest(r.json(), "s-drill")["desc"].startswith("Your focus:")


def test_preferences_dedupe_and_clear(client):
    r = client.put(f"/preferences?day={DAY}", json={"preferences": {"INT": ["coding", "CODING", " "]}})
    assert r.json()["preferences"]["INT"] == ["coding"]
    r = client.put(f"/preferences?day={DAY}", json={"preferences": {"INT": []}})
    assert "INT" not in r.json()["preferences"]


def test_player_update(client):
    r = client.put(
        f"/player?day={DAY}",
        json={"name": "Florante", "north_star": "  Be who I want to be  "},
    )
    body = r.json()
    assert body["player"]["name"] == "Florante"
    assert body["player"]["north_star"] == "Be who I want to be"  # trimmed


def test_reset(client):
    client.post("/completions", json={"quest_id": "d-train", "day": DAY})
    r = client.post(f"/reset?day={DAY}")
    assert r.status_code == 200
    assert r.json()["player"]["total_xp"] == 0
    assert r.json()["record"]["total_completions"] == 0


def test_record_is_all_time(client):
    assert client.get(f"/state?day={DAY}").json()["record"]["total_completions"] == 0
    # A completion on an earlier week still counts toward the all-time record, even
    # though it has dropped out of "this week".
    client.post("/completions", json={"quest_id": "d-train", "day": "2026-07-06"})
    rec = client.post("/completions", json={"quest_id": "d-train", "day": DAY}).json()["state"]["record"]
    assert rec["total_completions"] == 2
    assert rec["active_days"] == 2
    assert rec["xp"] > 0
    assert rec["top_stat"] == "STR"


def test_week_review_recaps_the_week(client):
    assert client.get(f"/state?day={DAY}").json()["week_review"]["completions"] == 0
    s = client.post("/completions", json={"quest_id": "d-train", "day": DAY}).json()["state"]
    wr = s["week_review"]
    assert wr["completions"] == 1 and wr["xp"] > 0
    assert wr["active_days"] == 1
    assert wr["top_stat"] == "STR" and wr["by_stat"].get("STR") == 1
    assert wr["week"].startswith("2026-W")
