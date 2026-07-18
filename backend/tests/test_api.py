"""Integration tests: the HTTP API end to end, against a throwaway database."""

DAY = "2026-07-18"
DAILY_IDS = ["d-train", "d-sketch", "d-meditate", "d-connect", "d-read"]


def _state(client):
    r = client.get(f"/state?day={DAY}")
    assert r.status_code == 200, r.text
    return r.json()


def _quest(state, qid):
    return next(q for q in state["quests"] if q["id"] == qid)


def test_state_shape(client):
    s = _state(client)
    for key in ("player", "stats", "streak", "today", "preferences", "quests", "achievements", "record"):
        assert key in s
    assert len(s["quests"]) == 15
    q = _quest(s, "d-train")
    assert "steps" in q and "steps_done" in q
    assert len(q["steps"]) == len(q["steps_done"])
    assert s["player"]["total_xp"] == 0


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


def test_step_toggle_rejected_for_multi_target(client):
    r = client.post("/steps", json={"quest_id": "w-badminton", "step_index": 0, "day": DAY})
    assert r.status_code == 400


def test_daily_clear_bonus(client):
    events = []
    for qid in DAILY_IDS:
        events = client.post("/completions", json={"quest_id": qid, "day": DAY}).json()["events"]
    assert any(e["type"] == "daily_clear" for e in events)
    # 5 dailies × 10 + 15 bonus
    assert _state(client)["player"]["total_xp"] == 65
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
