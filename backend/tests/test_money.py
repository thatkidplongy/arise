"""The money log: /state carries only the summary; entries come per-period from
/money/history (day | week | month). Add in/out, totals, scope ranges, remove."""

DAY = "2026-07-20"           # a Monday — start of ISO week 2026-W30
LAST_WEEK = "2026-07-19"     # the Sunday before — previous ISO week (still July)


def _hist(client, scope, day=DAY):
    return client.get(f"/money/history?scope={scope}&day={day}").json()


def test_state_carries_summary_only(client):
    m = client.get(f"/state?day={DAY}").json()["money"]
    assert "entries" not in m  # entries are fetched per-period, not shipped in /state
    assert m == {"today_in": 0, "today_out": 0, "week_in": 0, "week_out": 0, "balance": 0}

    m = client.post(f"/money?day={DAY}", json={"amount": 500, "direction": "in", "note": "gig"}).json()["money"]
    assert m["today_in"] == 500 and m["week_in"] == 500 and m["balance"] == 500

    m = client.post(f"/money?day={DAY}", json={"amount": 120.5, "direction": "out", "note": "lunch"}).json()["money"]
    assert m["today_out"] == 120.5 and m["balance"] == 379.5

    # A spend from last week counts in the all-time balance but not this week's out.
    client.post(f"/money?day={LAST_WEEK}", json={"amount": 999, "direction": "out"})
    m = client.get(f"/state?day={DAY}").json()["money"]
    assert m["week_out"] == 120.5 and m["balance"] == -619.5


def test_money_history_scopes(client):
    client.post(f"/money?day={DAY}", json={"amount": 500, "direction": "in", "note": "gig"})
    client.post(f"/money?day={DAY}", json={"amount": 120.5, "direction": "out", "note": "lunch"})
    client.post(f"/money?day={LAST_WEEK}", json={"amount": 999, "direction": "out"})

    # Week scope: only this week's two entries; 7 daily buckets; last week's 999 out.
    wk = _hist(client, "week")
    assert wk["scope"] == "week" and len(wk["buckets"]) == 7
    assert wk["earned"] == 500 and wk["spent"] == 120.5 and wk["net"] == 379.5
    assert {e["note"] for e in wk["entries"]} == {"gig", "lunch"}
    today_bucket = next(b for b in wk["buckets"] if b["day"] == DAY)
    assert today_bucket["earned"] == 500 and today_bucket["spent"] == 120.5

    # Day scope on last week: just the 999 spend.
    dayh = _hist(client, "day", LAST_WEEK)
    assert dayh["spent"] == 999 and len(dayh["buckets"]) == 1 and len(dayh["entries"]) == 1

    # Month scope: everything in July.
    mo = _hist(client, "month")
    assert mo["earned"] == 500 and mo["spent"] == 1119.5 and len(mo["entries"]) == 3

    # Removing an entry drops it from its period.
    lunch_id = next(e["id"] for e in wk["entries"] if e["note"] == "lunch")
    client.request("DELETE", f"/money/{lunch_id}?day={DAY}")
    assert _hist(client, "week")["spent"] == 0

    # The money log never touches XP.
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 0


def test_reset_clears_money_and_budget(client):
    # One pool → one reset. Set up pay, a commitment, a payday and some spending.
    client.put(f"/budget/income?day={DAY}", json={"monthly_income": 50000})
    client.post(f"/budget/commitments?day={DAY}", json={"label": "Rent", "amount": 12000, "bucket": "needs"})
    client.post(f"/money?day={DAY}", json={"amount": 50000, "direction": "in", "note": "Payday"})
    client.post(f"/money?day={DAY}", json={"amount": 120.5, "direction": "out", "note": "lunch"})
    client.post(f"/money?day={LAST_WEEK}", json={"amount": 999, "direction": "out"})

    # Balance follows the money: what came in minus what went out.
    assert client.get(f"/state?day={DAY}").json()["money"]["balance"] == 50000 - 120.5 - 999

    s = client.request("DELETE", f"/money?day={DAY}").json()
    assert s["money"] == {"today_in": 0, "today_out": 0, "week_in": 0, "week_out": 0, "balance": 0}
    # Reset is a full fresh start: salary and commitments go too, not just the log.
    assert s["budget"]["monthly_income"] == 0 and s["budget"]["start_month"] == ""
    assert s["budget"]["commitments"] == []
    assert _hist(client, "month")["entries"] == []
    assert _hist(client, "day", LAST_WEEK)["spent"] == 0

    # Resetting an already-clear pool is harmless, and logging still works after.
    client.request("DELETE", f"/money?day={DAY}")
    assert client.post(f"/money?day={DAY}", json={"amount": 20, "direction": "out"}).json()["money"]["balance"] == -20


def test_money_rejects_bad_input(client):
    assert client.post(f"/money?day={DAY}", json={"amount": 0, "direction": "in"}).status_code == 422
    assert client.post(f"/money?day={DAY}", json={"amount": 10, "direction": "sideways"}).status_code == 422
