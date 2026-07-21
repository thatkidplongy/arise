"""Per-attribute priorities: set (stat + focus + scope), scope expiry, one per
attribute, clear — each sits on top of its category without touching the plan."""

DAY = "2026-07-20"           # Monday — ISO week 2026-W30
NEXT_WEEK = "2026-07-27"     # the following Monday — W31


def _prio(state, stat):
    return next((p for p in state["priorities"] if p["stat"] == stat), None)


def test_priority_per_category(client):
    assert client.get(f"/state?day={DAY}").json()["priorities"] == []

    # Prioritise abs under Physical (STR) for the week — handcrafted frame + steps.
    s = client.post(f"/priority?day={DAY}", json={"stat": "STR", "focus": "work on my abs", "scope": "week"}).json()
    p = _prio(s, "STR")
    assert p and p["title"] == "Abs & core" and p["scope"] == "week"
    assert any("core" in x.lower() or "tuck" in x.lower() for x in p["steps"])

    # A second category can hold its own priority at the same time.
    s = client.post(f"/priority?day={DAY}", json={"stat": "WLT", "focus": "passive income", "scope": "open"}).json()
    assert {p["stat"] for p in s["priorities"]} == {"STR", "WLT"}
    assert _prio(s, "WLT")["title"] == "Passive income"

    # The 'week' one expires next week on its own; the 'open' one persists.
    nxt = client.get(f"/state?day={NEXT_WEEK}").json()
    assert _prio(nxt, "STR") is None and _prio(nxt, "WLT") is not None

    # Setting STR again replaces its priority (still one per attribute).
    s = client.post(f"/priority?day={DAY}", json={"stat": "STR", "focus": "footwork", "scope": "day"}).json()
    assert _prio(s, "STR")["title"] == "Badminton sharpening"
    assert len([p for p in s["priorities"] if p["stat"] == "STR"]) == 1

    # Clear just STR — WLT stays.
    s = client.request("DELETE", f"/priority/STR?day={DAY}").json()
    assert _prio(s, "STR") is None and _prio(s, "WLT") is not None


def test_priority_rejects_bad_input(client):
    assert client.post(f"/priority?day={DAY}", json={"stat": "STR", "focus": "", "scope": "week"}).status_code == 422
    # An unknown stat is ignored (no priority pinned), not an error.
    s = client.post(f"/priority?day={DAY}", json={"stat": "ZZZ", "focus": "x", "scope": "week"}).json()
    assert s["priorities"] == []
