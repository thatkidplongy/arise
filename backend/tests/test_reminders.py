"""The simple reminders list: add, list (via /state), remove."""

DAY = "2026-07-18"


def test_reminders_add_list_remove(client):
    assert client.get(f"/state?day={DAY}").json()["reminders"] == []

    s = client.post(f"/reminders?day={DAY}", json={"text": "Refill water bottle"}).json()
    assert [r["text"] for r in s["reminders"]] == ["Refill water bottle"]
    rid = s["reminders"][0]["id"]

    s = client.post(f"/reminders?day={DAY}", json={"text": "Stretch after badminton"}).json()
    assert len(s["reminders"]) == 2

    s = client.request("DELETE", f"/reminders/{rid}?day={DAY}").json()
    assert [r["text"] for r in s["reminders"]] == ["Stretch after badminton"]

    # Reminders are standalone — they never touch XP.
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 0


def test_reminder_rejects_empty(client):
    assert client.post(f"/reminders?day={DAY}", json={"text": ""}).status_code == 422


def test_reminder_toggle_keeps_done_items(client):
    s = client.post(f"/reminders?day={DAY}", json={"text": "Book dentist"}).json()
    rid = s["reminders"][0]["id"]
    assert s["reminders"][0]["done"] is False

    # Check it off — it stays in the list as done (a record), not removed.
    s = client.post(f"/reminders/{rid}/toggle?day={DAY}", json={"done": True}).json()
    assert next(r for r in s["reminders"] if r["id"] == rid)["done"] is True
    assert len(s["reminders"]) == 1

    # A fresh open to-do sorts ahead of the done one.
    s = client.post(f"/reminders?day={DAY}", json={"text": "Water plants"}).json()
    assert [r["done"] for r in s["reminders"]] == [False, True]

    # Toggle back to open.
    s = client.post(f"/reminders/{rid}/toggle?day={DAY}", json={"done": False}).json()
    assert next(r for r in s["reminders"] if r["id"] == rid)["done"] is False
