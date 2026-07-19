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


def test_add_insight_is_idempotent_per_url(db, monkeypatch):
    calls = {"fetch": 0, "distill": 0}

    def fake_fetch(url, **kw):
        calls["fetch"] += 1
        return {"lang": "en", "text": "Lower the floor, not the ceiling — keep going.", "source": "tiktok"}

    def fake_distill(t, **kw):
        calls["distill"] += 1
        return {"summary": "s", "takeaways": ["t"], "quotes": ["Q"]}

    monkeypatch.setattr(transcript, "fetch", fake_fetch)
    monkeypatch.setattr(llm, "distill_motivation", fake_distill)
    player = state.get_or_create_player(db)
    url = "https://www.tiktok.com/@a/video/1?utm_source=copy"
    first = insights.add_insight(db, player.id, url)
    # Re-capturing the same video (even via a different share query) returns the
    # stored insight without re-fetching or re-distilling — no wasted API calls.
    second = insights.add_insight(db, player.id, url + "&share_app_id=1180")
    assert second["id"] == first["id"]
    assert calls == {"fetch": 1, "distill": 1}
    assert len(insights.list_insights(db, player.id)) == 1


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


# ── Tips mode (a second kind of capture) ──────────────────────────────────────


def test_tips_capture_uses_the_tips_distiller(db, monkeypatch):
    monkeypatch.setattr(transcript, "fetch",
                        lambda url, **kw: {"lang": "en", "text": "How to meal prep in an hour.", "source": "youtube"})
    monkeypatch.setattr(llm, "distill_motivation",
                        lambda t, **kw: {"summary": "MOTIV", "takeaways": ["m"], "quotes": ["Q"]})
    monkeypatch.setattr(llm, "distill_tips",
                        lambda t, **kw: {"summary": "Batch-cook once a week.",
                                         "takeaways": ["Pick 3 proteins", "Cook in bulk"], "quotes": []})
    player = state.get_or_create_player(db)
    out = insights.add_insight(db, player.id, "https://youtu.be/abc123", kind="tips")
    assert out["kind"] == "tips"
    assert out["summary"] == "Batch-cook once a week."
    assert out["takeaways"] == ["Pick 3 proteins", "Cook in bulk"]
    assert out["quotes"] == []  # tips carry no quotes


def test_tips_quotes_never_feed_the_daily_nudge(db, monkeypatch):
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: {"lang": "en", "text": "x" * 40, "source": "web"})
    player = state.get_or_create_player(db)
    # Even if a tips capture somehow carried a quote, it must not surface on Status.
    monkeypatch.setattr(llm, "distill_tips",
                        lambda t, **kw: {"summary": "s", "takeaways": ["do this"], "quotes": ["SNEAKY"]})
    insights.add_insight(db, player.id, "https://youtu.be/tips1", kind="tips")
    assert insights.daily_quote(db, player.id, DAY) is None

    # A motivation capture's quote does surface.
    monkeypatch.setattr(llm, "distill_motivation",
                        lambda t, **kw: {"summary": "s", "takeaways": ["t"], "quotes": ["REAL"]})
    insights.add_insight(db, player.id, "https://youtu.be/mot1", kind="motivation")
    assert insights.daily_quote(db, player.id, DAY)["text"] == "REAL"


def test_same_url_can_be_both_motivation_and_tips(db, monkeypatch):
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: {"lang": "en", "text": "y" * 40, "source": "youtube"})
    monkeypatch.setattr(llm, "distill_motivation", lambda t, **kw: {"summary": "m", "takeaways": [], "quotes": ["Q"]})
    monkeypatch.setattr(llm, "distill_tips", lambda t, **kw: {"summary": "t", "takeaways": ["step"], "quotes": []})
    player = state.get_or_create_player(db)
    url = "https://youtu.be/dual"
    a = insights.add_insight(db, player.id, url, kind="motivation")
    b = insights.add_insight(db, player.id, url, kind="tips")
    assert a["id"] != b["id"]
    assert {i["kind"] for i in insights.list_insights(db, player.id)} == {"motivation", "tips"}
