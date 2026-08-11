"""The Recall API: logging what you learned, and the digest routes."""

DAY = "2026-07-18"


def _log(client, source="Deep Work, ch 2", text="", kind="book", day=DAY):
    return client.post("/learnings", json={
        "kind": kind, "source": source, "text": text, "day": day,
    })


def test_logging_a_learning_returns_it_in_state(client):
    state = _log(client).json()
    assert [e["source"] for e in state["learnings"]] == ["Deep Work, ch 2"]
    assert state["learnings"][0]["kind"] == "book"


def test_learnings_are_scoped_to_their_day(client):
    _log(client, source="Today's read")
    _log(client, source="Yesterday's read", day="2026-07-17")

    assert [e["source"] for e in client.get(f"/learnings?day={DAY}").json()] == ["Today's read"]
    assert [e["source"] for e in client.get("/learnings?day=2026-07-17").json()] == [
        "Yesterday's read"
    ]


def test_a_learning_can_be_notes_alone(client):
    state = _log(client, source="", text="Cache invalidation is a naming problem.", kind="work").json()
    assert state["learnings"][0]["text"] == "Cache invalidation is a naming problem."


def test_an_empty_learning_is_rejected(client):
    assert _log(client, source="", text="").status_code == 400


def test_a_bad_day_is_rejected(client):
    assert _log(client, day="18-07-2026").status_code == 422  # pydantic pattern


def test_an_unknown_kind_is_rejected(client):
    assert _log(client, kind="podcast").status_code == 422


def test_deleting_a_learning_removes_it(client):
    state = _log(client).json()
    learning_id = state["learnings"][0]["id"]
    after = client.delete(f"/learnings/{learning_id}?day={DAY}").json()
    assert after["learnings"] == []


def test_state_reports_the_digest_as_disabled_without_a_key(client):
    assert client.get(f"/state?day={DAY}").json()["digest_enabled"] is False


def test_recall_is_empty_before_anything_is_distilled(client):
    assert client.get(f"/state?day={DAY}").json()["recall"] == []


def test_preview_needs_a_gemini_key(client):
    assert client.get(f"/digest/preview?day={DAY}").status_code == 503


def test_send_needs_a_resend_key(client):
    assert client.post(f"/digest/send?day={DAY}").status_code == 503


def test_preview_renders_stored_highlights_without_sending(client, monkeypatch):
    from app import digest, llm, state as state_mod
    from app.db import SessionLocal
    from app.models import Highlight

    with SessionLocal() as db:
        player = state_mod.get_or_create_player(db)
        db.add(Highlight(
            player_id=player.id, day=DAY,
            text="Depth beats speed.", cue="What beats speed?",
        ))
        db.commit()

    monkeypatch.setattr(llm, "enabled", lambda: True)

    def _boom(*_a, **_k):
        raise AssertionError("preview must not send")

    monkeypatch.setattr(digest.mailer, "send", _boom)

    out = client.get(f"/digest/preview?day={DAY}").json()
    assert out["highlights"] == ["Depth beats speed."]
    assert "Depth beats speed." in out["html"]
    assert out["subject"].startswith("Recall · 1 question")


def test_state_recall_carries_the_cue_and_hook(client):
    """A schema that drops these silently turns the app back into passive review."""
    from app import state as state_mod
    from app.db import SessionLocal
    from app.models import Highlight

    with SessionLocal() as db:
        player = state_mod.get_or_create_player(db)
        db.add(Highlight(
            player_id=player.id, day="2026-07-04", text="Loss aversion is ~2x.",
            cue="How do losses weigh against equal gains?", hook="a scale tipping",
        ))
        db.commit()

    row = client.get("/state?day=2026-07-11").json()["recall"][0]
    assert row["cue"] == "How do losses weigh against equal gains?"
    assert row["hook"] == "a scale tipping"


def test_grade_endpoint_reschedules_and_returns_state(client):
    from app import state as state_mod
    from app.db import SessionLocal
    from app.models import Highlight

    with SessionLocal() as db:
        player = state_mod.get_or_create_player(db)
        row = Highlight(
            player_id=player.id, day="2026-07-04", text="Loss aversion is ~2x.",
            cue="How do losses weigh against equal gains?", box=3, due="2026-07-11",
        )
        db.add(row)
        db.commit()
        hid = row.id

    out = client.post(f"/recall/{hid}/grade?day=2026-07-11", json={"grade": "missed"})
    assert out.status_code == 200 and "recall" in out.json()  # full state back

    with SessionLocal() as db:
        row = db.get(Highlight, hid)
        assert row.box == 0 and row.due == "2026-07-12"  # front of the pile


def test_grade_endpoint_rejects_a_made_up_grade(client):
    assert client.post("/recall/whatever/grade?day=2026-07-11",
                       json={"grade": "brilliant"}).status_code == 422


def test_grade_endpoint_404s_for_an_unknown_highlight(client):
    assert client.post("/recall/no-such-id/grade?day=2026-07-11",
                       json={"grade": "got"}).status_code == 404
