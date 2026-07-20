"""The money log: add in/out lines, totals for today + this ISO week, remove."""

DAY = "2026-07-20"           # a Monday — start of ISO week 2026-W30
LAST_WEEK = "2026-07-19"     # the Sunday before — previous ISO week


def test_money_add_totals_remove(client):
    m = client.get(f"/state?day={DAY}").json()["money"]
    assert m["entries"] == [] and m["today_out"] == 0 and m["week_in"] == 0

    s = client.post(f"/money?day={DAY}", json={"amount": 500, "direction": "in", "note": "gig"}).json()
    m = s["money"]
    assert len(m["entries"]) == 1 and m["today_in"] == 500 and m["week_in"] == 500

    s = client.post(f"/money?day={DAY}", json={"amount": 120.5, "direction": "out", "note": "lunch"}).json()
    m = s["money"]
    assert m["today_out"] == 120.5 and m["week_out"] == 120.5
    assert m["entries"][0]["note"] == "lunch"  # newest first

    # A spend from last week counts in the log but not in this week's totals. Totals
    # are relative to the day the state is built for, so check them via /state?day=DAY.
    client.post(f"/money?day={LAST_WEEK}", json={"amount": 999, "direction": "out"})
    m = client.get(f"/state?day={DAY}").json()["money"]
    assert len(m["entries"]) == 3
    assert m["week_out"] == 120.5      # last week's 999 excluded
    assert m["today_out"] == 120.5     # and it's not today either

    # Remove the lunch line.
    lunch_id = next(e["id"] for e in m["entries"] if e["note"] == "lunch")
    s = client.request("DELETE", f"/money/{lunch_id}?day={DAY}").json()
    assert s["money"]["today_out"] == 0

    # The money log never touches XP.
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 0


def test_money_rejects_bad_input(client):
    assert client.post(f"/money?day={DAY}", json={"amount": 0, "direction": "in"}).status_code == 422
    assert client.post(f"/money?day={DAY}", json={"amount": 10, "direction": "sideways"}).status_code == 422
