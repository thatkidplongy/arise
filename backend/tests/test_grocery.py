"""The grocery list: add, list (via /state), mark bought, remove."""

DAY = "2026-07-18"


def test_grocery_add_list_remove(client):
    assert client.get(f"/state?day={DAY}").json()["grocery"] == []

    s = client.post(f"/grocery?day={DAY}", json={"name": "Bangus"}).json()
    assert [g["name"] for g in s["grocery"]] == ["Bangus"]
    gid = s["grocery"][0]["id"]

    s = client.post(f"/grocery?day={DAY}", json={"name": "Monggo"}).json()
    assert len(s["grocery"]) == 2

    s = client.request("DELETE", f"/grocery/{gid}?day={DAY}").json()
    assert [g["name"] for g in s["grocery"]] == ["Monggo"]

    # Groceries are standalone — they never touch XP.
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 0


def test_grocery_rejects_empty(client):
    assert client.post(f"/grocery?day={DAY}", json={"name": ""}).status_code == 422


def test_grocery_toggle_keeps_bought_items(client):
    s = client.post(f"/grocery?day={DAY}", json={"name": "Kamote"}).json()
    gid = s["grocery"][0]["id"]
    assert s["grocery"][0]["bought"] is False

    # Buy it — it stays in the list as bought (a record), not removed, and is
    # stamped with when (the You tab's Completed record shows this).
    s = client.post(f"/grocery/{gid}/toggle?day={DAY}", json={"bought": True}).json()
    bought = next(g for g in s["grocery"] if g["id"] == gid)
    assert bought["bought"] is True and bought["bought_at"] is not None
    assert len(s["grocery"]) == 1

    # A fresh still-to-buy item sorts ahead of the bought one.
    s = client.post(f"/grocery?day={DAY}", json={"name": "Malunggay"}).json()
    assert [g["bought"] for g in s["grocery"]] == [False, True]

    # Toggle back to unbought — the bought timestamp clears too.
    s = client.post(f"/grocery/{gid}/toggle?day={DAY}", json={"bought": False}).json()
    reopened = next(g for g in s["grocery"] if g["id"] == gid)
    assert reopened["bought"] is False and reopened["bought_at"] is None
