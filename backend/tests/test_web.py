"""The web-app fallback: a refresh or deep link must boot on the right screen.

Regression guard for the bug where every route served the Status shell
(index.html), so the active tab reset to Status on reload — and where /body
served API JSON because it collided with the Body tab's path.
"""

DAY = "2026-07-18"


def _is_html(resp) -> bool:
    return resp.status_code == 200 and "text/html" in resp.headers["content-type"]


def test_route_reload_serves_its_own_shell(client):
    # Each exported route page is distinct from the Status shell, so the client
    # boots on that route (and the matching tab stays lit) instead of Status.
    home = client.get("/")
    quests = client.get("/quests")
    assert _is_html(home) and _is_html(quests)
    assert quests.content != home.content


def test_body_path_is_the_app_not_the_api(client):
    # The bare /body path belongs to the Body tab; a browser refresh gets HTML.
    assert _is_html(client.get("/body"))
    # The body data moved to /body/state and still returns JSON.
    data = client.get(f"/body/state?day={DAY}").json()
    assert "targets" in data and "food" in data


def test_unknown_route_falls_back_to_index(client):
    # A path with no exported page still boots the SPA shell (client resolves it).
    unknown = client.get("/no-such-route-xyz")
    assert _is_html(unknown)
    assert unknown.content == client.get("/").content
