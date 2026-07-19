"""The quest history log: finished quests, newest first, with area + cadence."""


def test_history_lists_finished_quests_newest_first(client):
    assert client.get("/history").json() == []  # nothing done yet

    # Finish the reading daily on two different days.
    client.post("/completions", json={"quest_id": "d-read", "day": "2026-07-18"})
    client.post("/completions", json={"quest_id": "d-read", "day": "2026-07-19"})

    hist = client.get("/history").json()
    assert len(hist) == 2
    # Newest first (2026-07-19 was logged last).
    assert hist[0]["day"] == "2026-07-19"
    assert hist[1]["day"] == "2026-07-18"
    # Each item carries the quest's area + cadence, resolved from its def.
    item = hist[0]
    assert item["stat"] == "INT" and item["cadence"] == "daily"
    assert item["title"] and item["xp"] > 0 and item["at"]


def test_history_excludes_rest_days(client):
    # A rest day keeps the streak but isn't a quest — it must not show in history.
    client.post("/rest?day=2026-07-18")
    assert client.get("/history").json() == []
