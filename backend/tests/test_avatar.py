"""Profile avatar: set/get, validation, and that it stays out of the state payload."""

DAY = "2026-07-18"
PNG = "data:image/png;base64,iVBORw0KGgo="  # tiny but valid-looking data URI


def test_avatar_default_empty(client):
    assert client.get("/player/avatar").json() == {"avatar": ""}
    assert client.get(f"/state?day={DAY}").json()["player"]["has_avatar"] is False


def test_avatar_set_get_clear(client):
    r = client.put("/player/avatar", json={"avatar": PNG})
    assert r.status_code == 200 and r.json()["avatar"] == PNG
    assert client.get("/player/avatar").json()["avatar"] == PNG

    player = client.get(f"/state?day={DAY}").json()["player"]
    assert player["has_avatar"] is True
    assert "avatar" not in player  # kept OUT of the frequent /state payload

    client.put("/player/avatar", json={"avatar": ""})  # clear
    assert client.get(f"/state?day={DAY}").json()["player"]["has_avatar"] is False


def test_avatar_rejects_non_image(client):
    assert client.put("/player/avatar", json={"avatar": "just text"}).status_code == 400
