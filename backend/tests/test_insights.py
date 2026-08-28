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
    assert out["steps"] == []  # optional; empty when the payload has none (motivation)


def test_parse_distillation_caps_counts():
    out = llm._parse_distillation(_payload({
        "summary": "x",
        "takeaways": ["a", "b", "c", "d", "e", "f", "g"],
        "steps": ["s1", "s2", "s3", "s4", "s5", "s6", "s7"],
        "quotes": ["q1", "q2", "q3", "q4"],
    }))
    assert len(out["takeaways"]) == 6 and len(out["steps"]) == 6 and len(out["quotes"]) == 3


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


def _two_motivation_captures(db, monkeypatch):
    """Two captures, each with one quote and one takeaway, all four texts distinct."""
    monkeypatch.setattr(transcript, "fetch",
                        lambda url, **kw: {"lang": "en", "text": "x" * 40, "source": "tiktok"})
    player = state.get_or_create_player(db)
    monkeypatch.setattr(llm, "distill_motivation",
                        lambda t, **kw: {"summary": "s", "takeaways": ["T-A"], "quotes": ["Q-A"]})
    insights.add_insight(db, player.id, "https://www.tiktok.com/@a/video/1")
    monkeypatch.setattr(llm, "distill_motivation",
                        lambda t, **kw: {"summary": "s", "takeaways": ["T-B"], "quotes": ["Q-B"]})
    insights.add_insight(db, player.id, "https://www.tiktok.com/@b/video/2")
    return player


def test_takeaways_carry_the_same_as_quotes(db, monkeypatch):
    """A takeaway is what the video was telling you to do, which is as worth carrying
    as anything it said — and there are more of them. Both feed the daily line.

    Asserted on the pool rather than through daily_quote, so it's exact instead of
    depending on which line a hash happens to land on."""
    player = _two_motivation_captures(db, monkeypatch)
    lines = insights._all_lines(db, player.id)
    assert [l["text"] for l in lines] == ["Q-A", "T-A", "Q-B", "T-B"]
    # Only what was actually said may later be shown in quotation marks.
    assert [l["verbatim"] for l in lines] == [True, False, True, False]
    # Each line still knows which capture it came from.
    assert {l["source_title"] for l in lines} == {"@a", "@b"}


def test_daily_quote_is_deterministic_and_rotates(db, monkeypatch):
    player = _two_motivation_captures(db, monkeypatch)
    pool = {l["text"] for l in insights._all_lines(db, player.id)}

    # Same day → same line (stable across a day).
    q1 = insights.daily_quote(db, player.id, DAY)
    assert insights.daily_quote(db, player.id, DAY) == q1
    assert q1["text"] in pool

    # Every pick comes from the pool, and across two months the rotation reaches all
    # of it — quotes and takeaways alike, so a takeaway really does get its turn.
    seen = {
        insights.daily_quote(db, player.id, f"2026-{m:02d}-{d:02d}")["text"]
        for m in (7, 8) for d in range(1, 29)
    }
    assert seen == pool


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

    # A motivation capture does surface — and the tips capture's lines never do, on
    # any day. Checking the whole pool rather than one day's pick: with takeaways in
    # there too, asserting a single date passed only because a hash happened to land.
    monkeypatch.setattr(llm, "distill_motivation",
                        lambda t, **kw: {"summary": "s", "takeaways": ["REAL-T"], "quotes": ["REAL-Q"]})
    insights.add_insight(db, player.id, "https://youtu.be/mot1", kind="motivation")
    assert {l["text"] for l in insights._all_lines(db, player.id)} == {"REAL-Q", "REAL-T"}
    assert "SNEAKY" not in {l["text"] for l in insights._all_lines(db, player.id)}
    assert "do this" not in {l["text"] for l in insights._all_lines(db, player.id)}


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


# ── The failure ledger (links kept for a later go) ────────────────────────────


def _no_speech_stub(monkeypatch):
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: {"lang": "", "text": "", "source": "tiktok"})


def test_failed_capture_is_kept_with_its_reason(db, monkeypatch):
    _enable(monkeypatch)

    def boom(url, **kw):
        raise OSError("supadata unreachable")

    monkeypatch.setattr(transcript, "fetch", boom)
    player = state.get_or_create_player(db)
    with pytest.raises(insights.TranscriptFailed):
        insights.capture(db, player.id, "https://www.tiktok.com/@a/video/1?utm_source=copy")

    kept = insights.list_failures(db, player.id)
    assert len(kept) == 1
    # Stored canonically, like an insight, so a retry and a re-paste are the same link.
    assert kept[0]["source_url"] == "https://www.tiktok.com/@a/video/1"
    assert kept[0]["reason"] == "fetch_failed" and kept[0]["retryable"] is True
    assert kept[0]["title"] == "@a" and kept[0]["attempts"] == 1
    # Nothing was distilled, so nothing landed in the library.
    assert insights.list_insights(db, player.id) == []


def test_missing_key_is_kept_rather_than_lost(db, monkeypatch):
    # No keys at all (the conftest default) — the most retryable failure there is.
    player = state.get_or_create_player(db)
    with pytest.raises(insights.NoKey):
        insights.capture(db, player.id, "https://youtu.be/nokey")
    assert insights.list_failures(db, player.id)[0]["reason"] == "no_key"


def test_no_speech_is_kept_but_not_retryable(db, monkeypatch):
    _enable(monkeypatch)
    _no_speech_stub(monkeypatch)
    player = state.get_or_create_player(db)
    with pytest.raises(insights.NoTranscript):
        insights.capture(db, player.id, "https://www.tiktok.com/@x/video/9")
    kept = insights.list_failures(db, player.id)
    # Still listed (so you can see why it never landed), but a sweep won't spend a
    # call on it — there was never anything in that video to distil.
    assert kept[0]["reason"] == "no_speech" and kept[0]["retryable"] is False
    assert insights.retry_failures(db, player.id)["untried"] == 0


def test_retrying_the_same_link_bumps_one_row(db, monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: (_ for _ in ()).throw(OSError("down")))
    player = state.get_or_create_player(db)
    url = "https://www.tiktok.com/@a/video/1"
    for _ in range(3):
        with pytest.raises(insights.CaptureError):
            insights.capture(db, player.id, url)
    # A to-do list, not a log: one entry, three attempts.
    kept = insights.list_failures(db, player.id)
    assert len(kept) == 1 and kept[0]["attempts"] == 3


def test_a_landed_retry_clears_the_record(db, monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: (_ for _ in ()).throw(OSError("down")))
    player = state.get_or_create_player(db)
    url = "https://www.tiktok.com/@a/video/1"
    with pytest.raises(insights.TranscriptFailed):
        insights.capture(db, player.id, url)
    failure_id = insights.list_failures(db, player.id)[0]["id"]

    _stub(monkeypatch)  # the service comes back
    out = insights.retry_failure(db, player.id, failure_id)
    assert out["quotes"] == ["Lower the floor, not the ceiling."]
    assert insights.list_failures(db, player.id) == []  # nothing left to come back to
    assert len(insights.list_insights(db, player.id)) == 1


def test_forget_failure_drops_it(db, monkeypatch):
    player = state.get_or_create_player(db)
    with pytest.raises(insights.NoKey):
        insights.capture(db, player.id, "https://youtu.be/dead")
    failure_id = insights.list_failures(db, player.id)[0]["id"]
    insights.forget_failure(db, player.id, failure_id)
    assert insights.list_failures(db, player.id) == []


def test_retry_failure_404s_on_an_unknown_id(db):
    player = state.get_or_create_player(db)
    with pytest.raises(LookupError):
        insights.retry_failure(db, player.id, "nope")


def _fail_n_links(db, monkeypatch, n: int, prefix: str = "a"):
    """n kept links, each having failed once on a service that was down."""
    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: (_ for _ in ()).throw(OSError("down")))
    player = state.get_or_create_player(db)
    for i in range(n):
        with pytest.raises(insights.CaptureError):
            insights.capture(db, player.id, f"https://www.tiktok.com/@{prefix}/video/{i}")
    return player


def test_sweep_distils_everything_once_the_service_is_back(db, monkeypatch):
    player = _fail_n_links(db, monkeypatch, 3)
    _stub(monkeypatch)
    out = insights.retry_failures(db, player.id)
    assert len(out["captured"]) == 3 and out["failed"] == 0
    assert out["untried"] == 0 and out["remaining"] == []


def test_sweep_is_bounded_and_says_what_it_left(db, monkeypatch):
    player = _fail_n_links(db, monkeypatch, insights.SWEEP_MAX + 2)
    _stub(monkeypatch)
    out = insights.retry_failures(db, player.id)
    # Two small free tiers: a long ledger is walked over several sweeps, and what
    # was left is reported rather than quietly dropped.
    assert len(out["captured"]) == insights.SWEEP_MAX
    assert out["untried"] == 2 and len(out["remaining"]) == 2

    # A second sweep picks up exactly what the first one left.
    again = insights.retry_failures(db, player.id)
    assert len(again["captured"]) == 2 and again["remaining"] == []


def test_sweep_gives_up_while_the_blocker_is_still_there(db, monkeypatch):
    player = _fail_n_links(db, monkeypatch, insights.SWEEP_MAX)
    calls = {"n": 0}

    def still_down(url, **kw):
        calls["n"] += 1
        raise OSError("still down")

    monkeypatch.setattr(transcript, "fetch", still_down)
    out = insights.retry_failures(db, player.id)
    # Two misses is enough to know the key isn't in / the quota hasn't rolled —
    # spending the rest of the allowance would only re-learn the same thing.
    assert calls["n"] == insights.SWEEP_GIVE_UP
    assert out["captured"] == [] and out["failed"] == insights.SWEEP_GIVE_UP
    assert out["untried"] == insights.SWEEP_MAX - insights.SWEEP_GIVE_UP


def test_sweep_puts_the_least_tried_first(db, monkeypatch):
    """A link that keeps failing must not sit at the front of the queue eating the
    sweep's budget — the fresher ones are the ones likely to come good."""
    player = _fail_n_links(db, monkeypatch, 1, prefix="stale")
    stale_url = insights.list_failures(db, player.id)[0]["source_url"]
    for _ in range(4):  # four more attempts on the same stubborn link
        with pytest.raises(insights.CaptureError):
            insights.capture(db, player.id, stale_url)
    _fail_n_links(db, monkeypatch, insights.SWEEP_MAX, prefix="fresh")

    _stub(monkeypatch)
    out = insights.retry_failures(db, player.id)
    landed = {i["source_url"] for i in out["captured"]}
    assert len(landed) == insights.SWEEP_MAX
    assert stale_url not in landed
    assert insights.list_failures(db, player.id)[0]["source_url"] == stale_url


# ── The failure ledger over HTTP ──────────────────────────────────────────────


def test_failed_capture_surfaces_over_http(client, monkeypatch):
    # No Supadata key: the request still 503s, but the link is now kept.
    r = client.post("/insights", json={"url": "https://www.tiktok.com/@x/video/1"})
    assert r.status_code == 503
    kept = client.get("/insights/failed").json()
    assert len(kept) == 1 and kept[0]["reason"] == "no_key" and kept[0]["retryable"] is True

    # Retrying while it's still unavailable fails the same way, on the same one row.
    fid = kept[0]["id"]
    assert client.post(f"/insights/failed/{fid}/retry").status_code == 503
    assert client.get("/insights/failed").json()[0]["attempts"] == 2

    # Keys in place, the link distils and drops off the kept list.
    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: {
        "lang": "en", "text": "Stay consistent even when life gets messy.", "source": "tiktok"})
    monkeypatch.setattr(llm, "distill_motivation", lambda t, **kw: {
        "summary": "Show up anyway.", "takeaways": ["Lower the floor."], "quotes": ["Show up."]})
    assert client.post(f"/insights/failed/{fid}/retry").status_code == 200
    assert client.get("/insights/failed").json() == []
    assert len(client.get("/insights").json()) == 1


def test_sweep_and_forget_over_http(client, monkeypatch):
    for i in range(2):
        client.post("/insights", json={"url": f"https://www.tiktok.com/@x/video/{i}"})
    assert len(client.get("/insights/failed").json()) == 2

    # Give up on one by hand; the response is what's still kept.
    fid = client.get("/insights/failed").json()[0]["id"]
    assert len(client.request("DELETE", f"/insights/failed/{fid}").json()) == 1

    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: {
        "lang": "en", "text": "How to meal prep in one hour flat.", "source": "tiktok"})
    monkeypatch.setattr(llm, "distill_motivation", lambda t, **kw: {
        "summary": "s", "takeaways": ["t"], "quotes": ["Q"]})
    out = client.post("/insights/failed/retry").json()
    assert len(out["captured"]) == 1 and out["failed"] == 0
    assert out["untried"] == 0 and out["remaining"] == []
