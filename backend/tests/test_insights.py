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


def test_parse_distillation_keeps_an_ordinary_two_sentence_summary_whole():
    """The summary is the card's header — the line the Inspire list shows and the
    only part read when scanning. A real tips capture ran to ~280 characters and the
    old 220-character cap cut it at "error tracking, and…", mid-clause. Anything the
    tips prompt's own "1-2 plain sentences" can ordinarily produce must survive."""
    summary = (
        "This video teaches how to achieve deep memory retention using three "
        "high-effort learning techniques inspired by the Chinese education system. "
        "By embracing 'desirable difficulty' through handwriting, error tracking "
        "and active recall, you hold on to far more than rereading ever gives you."
    )
    assert 220 < len(summary) <= llm.MAX_SUMMARY  # the window the old cap cut
    out = llm._parse_distillation(_payload({"summary": summary, "takeaways": [], "quotes": []}))
    assert out["summary"] == summary
    assert llm.CUT not in out["summary"]


def test_parse_distillation_still_cuts_a_runaway_summary():
    """The cap is a guard, not a budget: a model that hands back the transcript is
    still cut — at a word boundary, and marked so the cut is visible."""
    out = llm._parse_distillation(_payload({
        "summary": "word " * 400, "takeaways": [], "quotes": [],
    }))
    assert len(out["summary"]) <= llm.MAX_SUMMARY
    assert out["summary"].endswith(llm.CUT)


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
    assert out["source_url"] == "https://tiktok.com/@justin.sagert/video/7632253916700216590"
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
    assert kept[0]["source_url"] == "https://tiktok.com/@a/video/1"
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


# ── Tutorial mode: a long video or an article → its main points ──────────────


def _tutorial_distill(t, kind="video", title="", **kw):
    return {"title": f"T:{kind}:{title}", "summary": "How to set up Postgres.",
            "takeaways": ["Use a role per app"], "steps": ["brew install postgresql"], "quotes": []}


def test_tutorial_reads_an_article_through_the_scraper(db, monkeypatch):
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: pytest.fail("a page isn't transcribed"))
    monkeypatch.setattr(transcript, "scrape", lambda url, **kw: {
        "title": "Postgres on a Mac", "text": "Step one: install it with brew.", "source": "web"})
    seen = {}

    def distill(t, **kw):
        seen["text"] = t
        return _tutorial_distill(t, **kw)

    monkeypatch.setattr(llm, "distill_tutorial", distill)
    player = state.get_or_create_player(db)
    out = insights.add_insight(db, player.id, "https://example.com/pg", kind="tutorial")
    assert out["kind"] == "tutorial"
    assert out["title"] == "T:article:Postgres on a Mac"  # the page title reaches the model
    assert out["takeaways"] == ["Use a role per app"]
    assert out["steps"] == ["brew install postgresql"]
    assert out["quotes"] == []
    assert seen["text"] == "Step one: install it with brew."


def test_tutorial_transcribes_a_video(db, monkeypatch):
    monkeypatch.setattr(transcript, "scrape", lambda url, **kw: pytest.fail("a video isn't scraped"))
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: {
        "lang": "en", "text": "Today we set up Postgres from scratch.", "source": "youtube"})
    monkeypatch.setattr(llm, "distill_tutorial", _tutorial_distill)
    player = state.get_or_create_player(db)
    out = insights.add_insight(db, player.id, "https://youtu.be/dQw4w9WgXcQ", kind="tutorial")
    assert out["title"] == "T:video:" and out["source"] == "youtube"


def test_tutorial_falls_back_to_the_host_when_nothing_names_it(db, monkeypatch):
    monkeypatch.setattr(transcript, "scrape", lambda url, **kw: {
        "title": "", "text": "Some real instructions here, long enough.", "source": "web"})
    monkeypatch.setattr(llm, "distill_tutorial", lambda t, **kw: {
        "title": "", "summary": "s", "takeaways": [], "steps": [], "quotes": []})
    player = state.get_or_create_player(db)
    out = insights.add_insight(db, player.id, "https://Docs.Example.com/x", kind="tutorial")
    assert out["title"] == "docs.example.com"


def test_an_empty_page_is_kept_to_try_again(db, monkeypatch):
    """Unlike a silent video, a page behind a login can read differently later — so
    it's retryable, never filed as no_speech."""
    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "scrape", lambda url, **kw: {"title": "", "text": "", "source": "web"})
    player = state.get_or_create_player(db)
    with pytest.raises(insights.NoText):
        insights.capture(db, player.id, "https://example.com/paywalled", kind="tutorial")
    [row] = insights.list_failures(db, player.id)
    assert row["kind"] == "tutorial" and row["reason"] == "fetch_failed" and row["retryable"]


def test_a_tutorial_is_its_own_capture_of_a_link(db, monkeypatch):
    monkeypatch.setattr(transcript, "fetch", lambda url, **kw: {
        "lang": "en", "text": "How to meal prep in an hour.", "source": "youtube"})
    monkeypatch.setattr(llm, "distill_tips", lambda t, **kw: {"summary": "t", "takeaways": ["x"], "quotes": []})
    monkeypatch.setattr(llm, "distill_tutorial", _tutorial_distill)
    player = state.get_or_create_player(db)
    url = "https://youtu.be/dQw4w9WgXcQ"
    a = insights.add_insight(db, player.id, url, kind="tips")
    b = insights.add_insight(db, player.id, url, kind="tutorial")
    assert a["id"] != b["id"]
    assert insights.add_insight(db, player.id, url, kind="tutorial")["id"] == b["id"]


def test_tutorials_never_feed_the_daily_nudge(db, monkeypatch):
    monkeypatch.setattr(transcript, "scrape", lambda url, **kw: {
        "title": "", "text": "Some real instructions here, long enough.", "source": "web"})
    monkeypatch.setattr(llm, "distill_tutorial", _tutorial_distill)
    player = state.get_or_create_player(db)
    insights.add_insight(db, player.id, "https://example.com/pg", kind="tutorial")
    assert insights.daily_quote(db, player.id, DAY) is None


def test_tutorial_capture_over_http(client, monkeypatch):
    _enable(monkeypatch)
    monkeypatch.setattr(transcript, "scrape", lambda url, **kw: {
        "title": "Guide", "text": "Some real instructions here, long enough.", "source": "web"})
    monkeypatch.setattr(llm, "distill_tutorial", _tutorial_distill)
    r = client.post("/insights", json={"url": "https://example.com/pg", "kind": "tutorial"})
    assert r.status_code == 200, r.text
    assert r.json()["kind"] == "tutorial"
    assert client.post("/insights", json={"url": "https://example.com/pg", "kind": "course"}).status_code == 422


def _gemini(obj):
    import json as _json
    return {"candidates": [{"content": {"parts": [{"text": _json.dumps(obj)}]}}]}


def test_tutorial_parse_keeps_a_long_walkthrough_whole():
    """A clip is capped at six points; a real walkthrough runs twelve, and cutting it
    to six drops half of what it taught."""
    out = llm._parse_tutorial(_gemini({
        "title": "Postgres", "summary": "s",
        "takeaways": [f"point {i}" for i in range(20)] + ["  "],
        "steps": [f"step {i}" for i in range(20)],
    }))
    assert out["takeaways"] == [f"point {i}" for i in range(llm.MAX_TUTORIAL_POINTS)]
    assert len(out["steps"]) == llm.MAX_TUTORIAL_STEPS
    assert out["quotes"] == []


def test_distill_tutorial_sends_the_page_title_and_caps_the_source(monkeypatch):
    sent = {}

    def ask(parts, schema, temperature, timeout, retries=0, spend=0):
        sent["parts"] = parts
        return _gemini({"title": "t", "summary": "s", "takeaways": [], "steps": []})

    monkeypatch.setattr(llm, "_ask", ask)
    llm.distill_tutorial("x" * (llm.MAX_TUTORIAL_SOURCE + 500), kind="article", title="Guide")
    texts = [p["text"] for p in sent["parts"]]
    assert "PAGE TITLE: Guide" in texts
    assert texts[-1].startswith("ARTICLE TEXT:\n")
    assert len(texts[-1]) == len("ARTICLE TEXT:\n") + llm.MAX_TUTORIAL_SOURCE


# ── Recipe mode: a cooking video or a recipe page → ingredients + method ──────


_RECIPE = {
    "title": "Garlic butter salmon", "summary": "Serves 2 · 20 min · a one-pan salmon.",
    "ingredients": [{"amount": "2", "item": "salmon fillets"}, {"amount": "", "item": "salt, to taste"}],
    "steps": ["Sear skin-side down, 4 min"], "takeaways": [], "quotes": [],
}


def _recipe_video(monkeypatch, speech="", caption="", fetch_fails=False):
    seen = {}

    def fetch(url, **kw):
        if fetch_fails:
            raise ValueError("supadata down")
        return {"lang": "en", "text": speech, "source": "tiktok"}

    def distill(t, **kw):
        seen.update(text=t, **kw)
        return dict(_RECIPE)

    monkeypatch.setattr(transcript, "fetch", fetch)
    monkeypatch.setattr(transcript, "metadata", lambda url, **kw: {"title": "Salmon!!", "caption": caption})
    monkeypatch.setattr(llm, "distill_recipe", distill)
    return seen


def test_recipe_reads_a_videos_caption_as_well_as_its_speech(db, monkeypatch):
    seen = _recipe_video(monkeypatch, speech="Now we sear the salmon skin-side down.",
                         caption="Ingredients: 2 salmon fillets, butter, garlic")
    player = state.get_or_create_player(db)
    out = insights.add_insight(db, player.id, "https://www.tiktok.com/@chef/video/1", kind="recipe")
    assert out["kind"] == "recipe" and out["title"] == "Garlic butter salmon"
    assert out["ingredients"] == _RECIPE["ingredients"]
    assert out["steps"] == ["Sear skin-side down, 4 min"]
    assert seen["caption"].startswith("Ingredients:")
    assert seen["text"] == "Now we sear the salmon skin-side down."
    assert seen["title"] == "Salmon!!"  # the post's own title, as a hint


def test_a_music_only_recipe_video_is_read_from_its_caption(db, monkeypatch):
    """The usual cooking Reel: music over the food, recipe written underneath."""
    seen = _recipe_video(monkeypatch, speech="", caption="2 salmon fillets, 30 g butter, 3 cloves garlic")
    player = state.get_or_create_player(db)
    out = insights.add_insight(db, player.id, "https://www.tiktok.com/@chef/video/1", kind="recipe")
    assert out["ingredients"]
    assert seen["text"] == ""


def test_a_recipe_caption_carries_on_when_the_transcript_cant_be_had(db, monkeypatch):
    _recipe_video(monkeypatch, caption="2 salmon fillets, 30 g butter, 3 cloves garlic", fetch_fails=True)
    player = state.get_or_create_player(db)
    assert insights.add_insight(db, player.id, "https://www.tiktok.com/@chef/video/1", kind="recipe")["ingredients"]


def test_a_recipe_video_with_neither_speech_nor_caption_says_so(db, monkeypatch):
    _recipe_video(monkeypatch, speech="", caption="")
    player = state.get_or_create_player(db)
    with pytest.raises(insights.NoTranscript, match="caption"):
        insights.add_insight(db, player.id, "https://www.tiktok.com/@chef/video/1", kind="recipe")


def test_a_recipe_goes_on_without_a_caption_when_metadata_fails(db, monkeypatch):
    seen = _recipe_video(monkeypatch, speech="First you take two salmon fillets and salt them.")

    def broken(url, **kw):
        raise ValueError("metadata down")

    monkeypatch.setattr(transcript, "metadata", broken)
    player = state.get_or_create_player(db)
    insights.add_insight(db, player.id, "https://www.tiktok.com/@chef/video/1", kind="recipe")
    assert seen["caption"] == "" and seen["title"] == ""


def test_a_recipe_page_is_scraped_and_asks_for_no_caption(db, monkeypatch):
    monkeypatch.setattr(transcript, "metadata", lambda url, **kw: pytest.fail("a page has no caption"))
    monkeypatch.setattr(transcript, "scrape", lambda url, **kw: {
        "title": "Best salmon", "text": "My grandmother... Ingredients: 2 salmon fillets.", "source": "web"})
    seen = {}

    def distill(t, **kw):
        seen.update(kw)
        return dict(_RECIPE)

    monkeypatch.setattr(llm, "distill_recipe", distill)
    player = state.get_or_create_player(db)
    out = insights.add_insight(db, player.id, "https://example.com/salmon", kind="recipe")
    assert out["source"] == "web" and seen["kind"] == "article" and seen["caption"] == ""


def test_only_a_recipe_carries_ingredients(db, monkeypatch):
    monkeypatch.setattr(transcript, "scrape", lambda url, **kw: {
        "title": "", "text": "Some real instructions here, long enough.", "source": "web"})
    monkeypatch.setattr(llm, "distill_tutorial", _tutorial_distill)
    player = state.get_or_create_player(db)
    assert insights.add_insight(db, player.id, "https://example.com/pg", kind="tutorial")["ingredients"] == []


def test_recipe_capture_over_http(client, monkeypatch):
    _enable(monkeypatch)
    _recipe_video(monkeypatch, caption="2 salmon fillets, 30 g butter, 3 cloves garlic")
    r = client.post("/insights", json={"url": "https://www.tiktok.com/@chef/video/1", "kind": "recipe"})
    assert r.status_code == 200, r.text
    assert r.json()["ingredients"][1] == {"amount": "", "item": "salt, to taste"}
    assert client.get("/insights").json()[0]["ingredients"][0] == {"amount": "2", "item": "salmon fillets"}


def test_recipe_parse_keeps_every_ingredient_line_and_drops_empty_ones():
    out = llm._parse_recipe(_gemini({
        "title": "Salmon", "summary": "s",
        "ingredients": [{"amount": "2 tbsp", "item": "butter"}, {"amount": "1 tbsp", "item": "butter"},
                        {"amount": "3", "item": "  "}, "garlic", {"item": "salt, to taste"}],
        "steps": ["Sear", ""],
    }))
    assert out["ingredients"] == [
        {"amount": "2 tbsp", "item": "butter"},
        {"amount": "1 tbsp", "item": "butter"},  # two uses stay two lines
        {"amount": "", "item": "salt, to taste"},
    ]
    assert out["steps"] == ["Sear"] and out["takeaways"] == [] and out["quotes"] == []


def test_distill_recipe_sends_the_caption_before_the_speech(monkeypatch):
    sent = {}

    def ask(parts, schema, temperature, timeout, retries=0, spend=0):
        sent["parts"] = parts
        return _gemini({"title": "t", "summary": "s", "ingredients": [], "steps": []})

    monkeypatch.setattr(llm, "_ask", ask)
    llm.distill_recipe("", kind="video", caption="2 fillets")
    assert [p["text"].split(":")[0] for p in sent["parts"][1:]] == ["VIDEO CAPTION"]  # no blank transcript
    llm.distill_recipe("we sear it", kind="video", caption="2 fillets")
    assert [p["text"].split(":")[0] for p in sent["parts"][1:]] == ["VIDEO CAPTION", "VIDEO TRANSCRIPT"]
