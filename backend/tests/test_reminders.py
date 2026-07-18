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
