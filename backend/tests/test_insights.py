"""Insights: distillation parsing, storage, the daily-quote rotation, and the API."""

import json

import pytest

from app import insights, llm, state, transcript

DAY = "2026-07-18"


def _payload(obj: dict) -> dict:
    """Wrap a distillation object in the shape Gemini's API returns."""
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(obj)}]}}]}


# ── llm.distill_motivation parsing (pure, no network) ─────────────────────────


def test_parse_distillation_trims_and_drops_blanks():
    out = llm._parse_distillation(_payload({
        "summary": "  A warm one-liner.  ",
        "takeaways": ["Lower the floor, not the ceiling.", "   ", "Reset fast."],
        "quotes": ["Consistency survives when your minimum is realistic.", ""],
    }))
    assert out["summary"] == "A warm one-liner."
    assert out["takeaways"] == ["Lower the floor, not the ceiling.", "Reset fast."]
    assert out["quotes"] == ["Consistency survives when your minimum is realistic."]


def test_parse_distillation_caps_counts():
    out = llm._parse_distillation(_payload({
        "summary": "x",
        "takeaways": ["a", "b", "c", "d", "e", "f"],
        "quotes": ["q1", "q2", "q3", "q4"],
    }))
    assert len(out["takeaways"]) == 4 and len(out["quotes"]) == 3


# ── add / list / remove (db-level, network stubbed) ───────────────────────────


def _stub(monkeypatch, text="Lower the floor, not the ceiling. Stay consistent when it's messy."):
    monkeypatch.setattr(transcript, "fetch",
                        lambda url, **kw: {"lang": "en", "text": text, "source": "tiktok"})
    monkeypatch.setattr(llm, "distill_motivation",
                        lambda t, **kw: {"summary": "Show up on the messy days.",
                                         "takeaways": ["Aim for non-zero."],
                                         "quotes": ["Lower the floor, not the ceiling."]})


def test_add_and_list_insight(db, monkeypatch):
    _stub(monkeypatch)
    player = state.get_or_create_player(db)
    url = ("https://www.tiktok.com/@justin.sagert/video/7632253916700216590"
           "?utm_source=copy&share_app_id=1180")
    out = insights.add_insight(db, player.id, url)
    assert out["source"] == "tiktok"
    assert out["title"] == "@justin.sagert"
    # The stored URL is the trimmed, canonical one — not the giant share link.
    assert out["source_url"] == "https://www.tiktok.com/@justin.sagert/video/7632253916700216590"
    assert out["quotes"] == ["Lower the floor, not the ceiling."]
    listed = insights.list_insights(db, player.id)
    assert len(listed) == 1 and listed[0]["id"] == out["id"]


def test_add_insight_rejects_empty_transcript(db, monkeypatch):
    _stub(monkeypatch, text="   ")  # music-only / no speech
    player = state.get_or_create_player(db)
    with pytest.raises(insights.NoTranscript):
        insights.add_insight(db, player.id, "https://www.tiktok.com/@x/video/1")


def test_daily_quote_is_deterministic_and_rotates(db, monkeypatch):
    monkeypatch.setattr(transcript, "fetch",
                        lambda url, **kw: {"lang": "en", "text": "x" * 40, "source": "tiktok"})
    player = state.get_or_create_player(db)
    monkeypatch.setattr(llm, "distill_motivation",
                        lambda t, **kw: {"summary": "s", "takeaways": ["t"], "quotes": ["Q-A"]})
    insights.add_insight(db, player.id, "https://www.tiktok.com/@a/video/1")
    monkeypatch.setattr(llm, "distill_motivation",
                        lambda t, **kw: {"summary": "s", "takeaways": ["t"], "quotes": ["Q-B"]})
    insights.add_insight(db, player.id, "https://www.tiktok.com/@b/video/2")

    # Same day → same quote (stable across a day).
    q1 = insights.daily_quote(db, player.id, DAY)
    assert insights.daily_quote(db, player.id, DAY) == q1
    assert q1["text"] in {"Q-A", "Q-B"}
    # Across a month both quotes surface — the rotation covers the whole set.
    seen = {insights.daily_quote(db, player.id, f"2026-07-{d:02d}")["text"] for d in range(1, 29)}
    assert seen == {"Q-A", "Q-B"}


def test_daily_quote_none_when_empty(db):
    player = state.get_or_create_player(db)
    assert insights.daily_quote(db, player.id, DAY) is None


# ── HTTP surface (integration) ────────────────────────────────────────────────


def _enable(monkeypatch):
    monkeypatch.setattr(transcript, "enabled", lambda: True)
    monkeypatch.setattr(llm, "enabled", lambda: True)


def test_insights_endpoint_requires_key(client):
    # Default: no Supadata key → the capture endpoint is cleanly unavailable.
    r = client.post("/insights", json={"url": "https://www.tiktok.com/@x/video/1"})
    assert r.status_code == 503


def test_capture_flow_over_http(client, monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: {
        "lang": "en", "text": "Stay consistent even when life gets messy.", "source": "tiktok"})
    monkeypatch.setattr(llm, "distill_motivation", lambda t, **kw: {
        "summary": "Show up anyway.",
        "takeaways": ["Lower the floor."],
        "quotes": ["Built when life gets messy and you still show up."]})

    r = client.post("/insights", json={
        "url": "https://www.tiktok.com/@justin.sagert/video/7632253916700216590"})
    assert r.status_code == 200, r.text
    ins = r.json()
    assert ins["title"] == "@justin.sagert" and ins["quotes"]

    # It lists, and its quote surfaces on Status.
    assert len(client.get("/insights").json()) == 1
    dq = client.get(f"/state?day={DAY}").json()["daily_quote"]
    assert dq and dq["text"] == "Built when life gets messy and you still show up."
    # Inspire is standalone — it never touches XP.
    assert client.get(f"/state?day={DAY}").json()["player"]["total_xp"] == 0

    # Deleting it empties the list and clears the daily quote.
    assert client.request("DELETE", f"/insights/{ins['id']}").json() == []
    assert client.get(f"/state?day={DAY}").json()["daily_quote"] is None


def test_capture_reports_no_speech(client, monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "fetch",
                        lambda url, **kw: {"lang": "", "text": "", "source": "tiktok"})
    r = client.post("/insights", json={"url": "https://www.tiktok.com/@x/video/1"})
    assert r.status_code == 422
