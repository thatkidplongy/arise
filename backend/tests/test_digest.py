"""Recall digest: distillation parsing, gathering, the spaced recall picks,
rendering, and the once-per-day send guard. No network, no email."""

import json
from datetime import date, timedelta

import pytest

from app import digest, llm, reading, state
from app.models import Completion, Highlight, Learning, ReadingLog, Thread

DAY = "2026-07-18"


def _payload(obj: dict) -> dict:
    """Wrap a distillation object in the shape Gemini's API returns."""
    return {"candidates": [{"content": {"parts": [{"text": json.dumps(obj)}]}}]}


def _learn(db, player, day, kind="book", source="Atomic Habits, ch 5-6", text=""):
    row = Learning(player_id=player.id, day=day, kind=kind, source=source, text=text)
    db.add(row)
    db.commit()
    return row


def _back(days: int) -> str:
    return (date.fromisoformat(DAY) - timedelta(days=days)).isoformat()


def _highlight(db, player, day, text):
    row = Highlight(player_id=player.id, day=day, text=text, source_label="A book")
    db.add(row)
    db.commit()
    return row


# ── llm.distill_learning parsing (pure, no network) ───────────────────────────


def test_parse_learning_trims_and_drops_blanks():
    out = llm._parse_learning(_payload({
        "highlights": [
            {"text": "  Habits form through cue, craving, response, reward.  ",
             "cue": "  What are the four stages of a habit?  ", "hook": ""},
            {"text": "   ", "cue": "dropped — no substance"},
            {"text": "Start small.", "cue": "How big should a new habit be?"},
        ],
    }))
    assert [h["text"] for h in out["highlights"]] == [
        "Habits form through cue, craving, response, reward.",
        "Start small.",
    ]
    assert out["highlights"][0]["cue"] == "What are the four stages of a habit?"


def test_parse_learning_keeps_a_highlight_that_came_back_without_a_cue():
    """Better unquizzed than asked with a question invented after the fact."""
    out = llm._parse_learning(_payload({"highlights": [{"text": "Depth beats speed."}]}))
    assert out["highlights"] == [{"text": "Depth beats speed.", "cue": "", "hook": ""}]


def test_parse_learning_ignores_non_objects():
    out = llm._parse_learning(_payload({"highlights": ["a bare string", {"text": "kept", "cue": "q"}]}))
    assert [h["text"] for h in out["highlights"]] == ["kept"]


def test_parse_learning_caps_at_ten():
    out = llm._parse_learning(_payload({
        "highlights": [{"text": f"h{i}", "cue": f"q{i}"} for i in range(20)],
    }))
    assert len(out["highlights"]) == 10


def test_every_highlight_is_asked_for_a_hook():
    """The schema is where 'sometimes' became 'always' — a line without one is now a
    line the model failed to fill in, not a line that opted out."""
    item = llm._LEARNING_SCHEMA["properties"]["highlights"]["items"]
    assert "hook" in item["required"]


def test_format_entries_omits_notes_when_empty():
    text = llm._format_entries([
        {"kind": "book", "source": "Deep Work", "text": ""},
        {"kind": "notion", "source": "Caching notes", "text": "Write-through vs write-back."},
    ])
    assert "SOURCE: Deep Work (book)" in text
    assert "THEIR NOTES: Write-through vs write-back." in text
    assert text.count("THEIR NOTES") == 1


# ── gather ────────────────────────────────────────────────────────────────────


def test_gather_collects_logged_learnings(db):
    player = state.get_or_create_player(db)
    _learn(db, player, DAY, source="Deep Work, ch 2")
    entries = digest.gather(db, player, DAY)
    assert [e["source"] for e in entries] == ["Deep Work, ch 2"]


def test_gather_adds_the_reading_daily_when_no_book_was_logged(db):
    player = state.get_or_create_player(db)
    player.current_book = "Atomic Habits"
    db.add(Completion(player_id=player.id, quest_id="d-read", xp=10, day=DAY))
    db.commit()

    entries = digest.gather(db, player, DAY)
    assert [e["source"] for e in entries] == ["Atomic Habits"]


def test_gather_prefers_the_logged_book_over_the_reading_daily(db):
    """Logging the book yourself names the actual chapters, so the vaguer derived
    entry would only muddy the distillation."""
    player = state.get_or_create_player(db)
    player.current_book = "Atomic Habits"
    db.add(Completion(player_id=player.id, quest_id="d-read", xp=10, day=DAY))
    db.commit()
    _learn(db, player, DAY, kind="book", source="Atomic Habits, ch 5-6")

    entries = digest.gather(db, player, DAY)
    assert [e["source"] for e in entries] == ["Atomic Habits, ch 5-6"]


def test_gather_names_the_chapters_from_the_reading_log(db):
    """The reading log knows which chapters were read, so the derived entry can be
    specific instead of hedging about 'today's chapters'."""
    player = state.get_or_create_player(db)
    player.current_book = "Atomic Habits"
    db.add(ReadingLog(player_id=player.id, day=DAY, book="Atomic Habits", chapters=2, label="5–6"))
    db.commit()

    entries = digest.gather(db, player, DAY)
    assert [e["source"] for e in entries] == ["Atomic Habits, ch 5–6"]
    assert "5–6" in entries[0]["text"]


def test_gather_stays_general_when_the_log_carries_no_chapter_names(db):
    """A count with no label ('2 chapters') says nothing about which ones — better a
    general note than an invented chapter number."""
    player = state.get_or_create_player(db)
    player.current_book = "Atomic Habits"
    db.add(ReadingLog(player_id=player.id, day=DAY, book="Atomic Habits", chapters=2, label=""))
    db.add(Completion(player_id=player.id, quest_id="d-read", xp=10, day=DAY))
    db.commit()

    entries = digest.gather(db, player, DAY)
    assert [e["source"] for e in entries] == ["Atomic Habits"]


def test_gather_is_empty_on_a_day_with_nothing(db):
    player = state.get_or_create_player(db)
    assert digest.gather(db, player, DAY) == []


def test_gather_keeps_a_reflection_prompt_out_of_the_source(db):
    """The prompt is a paragraph-long question — useful context for the distiller,
    useless as an attribution label under a highlight."""
    from app.models import QuestNote

    player = state.get_or_create_player(db)
    db.add(QuestNote(
        player_id=player.id, quest_id="d-grow", period_key=DAY, day=DAY,
        text="Base rates come first.",
        prompt="Explain it out loud in plain words, like teaching a 12-year-old",
    ))
    db.commit()

    entry = digest.gather(db, player, DAY)[0]
    assert entry["source"] == ""
    assert "teaching a 12-year-old" in entry["text"]  # the distiller still sees it
    assert "Base rates come first." in entry["text"]


# ── source_label ──────────────────────────────────────────────────────────────


def test_source_label_names_real_sources():
    label = digest.source_label([
        {"kind": "book", "source": "Thinking, Fast and Slow", "text": ""},
        {"kind": "work", "source": "Caching review", "text": ""},
    ])
    assert label == "Thinking, Fast and Slow · Caching review"


def test_source_label_caps_the_list():
    label = digest.source_label([
        {"kind": "book", "source": f"Book {i}", "text": ""} for i in range(5)
    ])
    assert label == "Book 0 · Book 1"


def test_source_label_dedupes():
    label = digest.source_label([
        {"kind": "book", "source": "Deep Work", "text": ""},
        {"kind": "book", "source": "Deep Work", "text": ""},
    ])
    assert label == "Deep Work"


def test_source_label_falls_back_for_reflections_only():
    assert digest.source_label([{"kind": "reflection", "source": "", "text": "x"}]) == (
        "From your reflections"
    )


def test_source_label_is_empty_with_nothing_to_name():
    assert digest.source_label([]) == ""
    assert digest.source_label([{"kind": "other", "source": "", "text": "x"}]) == ""


# ── build_highlights ──────────────────────────────────────────────────────────


def test_build_highlights_returns_existing_without_calling_the_llm(db, monkeypatch):
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "Already distilled.")

    def _boom(*_a, **_k):
        raise AssertionError("should not call the LLM for a day already distilled")

    monkeypatch.setattr(llm, "distill_learning", _boom)
    rows = digest.build_highlights(db, player, DAY)
    assert [r.text for r in rows] == ["Already distilled."]


def test_build_highlights_is_empty_without_an_llm_key(db):
    player = state.get_or_create_player(db)
    _learn(db, player, DAY)
    assert digest.build_highlights(db, player, DAY) == []  # no key in tests


def test_build_highlights_persists_distilled_lines(db, monkeypatch):
    player = state.get_or_create_player(db)
    _learn(db, player, DAY, source="Deep Work, ch 2")
    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "distill_learning", lambda _e: {"highlights": [
        {"text": "Depth beats speed.", "cue": "What beats speed?", "hook": "deep well"},
    ]})

    rows = digest.build_highlights(db, player, DAY)
    assert [r.text for r in rows] == ["Depth beats speed."]
    assert rows[0].cue == "What beats speed?"
    assert rows[0].hook == "deep well"
    assert rows[0].source_label == "Deep Work, ch 2"
    stored = db.query(Highlight).filter_by(player_id=player.id, day=DAY).all()
    assert len(stored) == 1


class _Exhausted(Exception):
    """Gemini's free-tier daily cap, as urllib raises it."""
    code = 429

    def read(self):
        return b"Quota exceeded for metric: generate_content_free_tier_requests"


def test_a_failed_distillation_is_reported_not_raised(db, monkeypatch):
    player = state.get_or_create_player(db)
    _learn(db, player, DAY, source="Deep Work, ch 2")
    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "distill_learning", lambda _e: (_ for _ in ()).throw(_Exhausted()))

    problems: list[str] = []
    assert digest.build_highlights(db, player, DAY, problems) == []
    assert problems and problems[0].startswith("not distilled (_Exhausted 429")
    # Nothing written, so the day distils properly once there's quota again.
    assert db.query(Highlight).filter_by(player_id=player.id, day=DAY).count() == 0


def test_the_email_still_goes_out_when_distilling_fails(db, monkeypatch):
    """A free-tier quota running out must not cost the whole morning: the day's
    record and the spaced recall need no model at all."""
    player = state.get_or_create_player(db)
    _learn(db, player, DAY, source="Deep Work, ch 2")
    db.add(Completion(player_id=player.id, quest_id="d-train", xp=10, day=DAY))
    db.commit()
    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "distill_learning", lambda _e: (_ for _ in ()).throw(_Exhausted()))
    sent = {}
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    monkeypatch.setattr(digest.mailer, "send",
                        lambda s, h, t, **_k: sent.update(subject=s, text=t) or {"id": "1"})

    out = digest.send_daily(db, player, DAY)
    assert out["status"] == "sent"
    assert "1 quest finished" in sent["text"]  # the recap made it
    assert "429" in out["detail"]  # and the hole in it is on the record


def test_a_clean_send_records_no_note(db, monkeypatch):
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "Depth beats speed.")
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    monkeypatch.setattr(digest.mailer, "send", lambda s, h, t, **_k: {"id": "1"})
    assert digest.send_daily(db, player, DAY)["detail"] == ""



# ── Rendering ─────────────────────────────────────────────────────────────────


def _ctx(highlights=(), recall=()):
    """`highlights` items are (text, cue) pairs, or bare text for the cueless case."""
    rows = []
    for h in highlights:
        text, cue = h if isinstance(h, tuple) else (h, "")
        rows.append({"text": text, "cue": cue, "hook": "", "source_label": ""})
    return {"day": DAY, "name": "Hunter", "highlights": rows, "recall": list(recall)}


def _recalled(text, cue, days_ago=7, source="", hook=""):
    return {
        "id": text, "text": text, "cue": cue, "hook": hook,
        "day": "2026-07-11", "source_label": source, "days_ago": days_ago,
    }


def test_render_text_asks_before_it_answers():
    ctx = _ctx([("Depth beats speed.", "What beats speed?")],
               [_recalled("Start small.", "How big should a new habit be?")])
    out = digest.render_text(ctx)

    assert out.index("TRY TO RECALL") < out.index("ANSWERS")
    # every cue precedes every answer — the whole point of the layout
    assert out.index("What beats speed?") < out.index("Depth beats speed.")
    assert out.index("How big should a new habit be?") < out.index("Start small.")
    assert "7 days ago" in out


def test_render_text_shows_a_hook_only_with_the_answer():
    ctx = _ctx(recall=[_recalled("Mango.", "Which symbol means mango?", hook="a fruit on a roof")])
    out = digest.render_text(ctx)
    assert out.index("Which symbol means mango?") < out.index("a fruit on a roof")


def test_render_text_is_kind_about_an_empty_day():
    out = digest.render_text(_ctx())
    assert "rest counts" in out
    assert "TRY TO RECALL" not in out


def test_render_keeps_a_cueless_highlight_rather_than_dropping_it():
    ctx = _ctx(["Depth beats speed."])  # no cue — legacy row
    assert "Depth beats speed." in digest.render_text(ctx)
    assert "Depth beats speed." in digest.render_html(ctx)


def test_render_html_inlines_every_style():
    html = digest.render_html(_ctx([("Depth beats speed.", "What beats speed?")]))
    assert "Depth beats speed." in html
    assert "<style" not in html and "class=" not in html  # mail clients strip stylesheets


def test_render_html_puts_the_answers_below_the_questions():
    html = digest.render_html(_ctx([("Depth beats speed.", "What beats speed?")]))
    assert html.index("Try to recall") < html.index("Answers")
    assert html.index("What beats speed?") < html.index("Depth beats speed.")


def test_every_email_invites_adding_flesh():
    """The 24-hour window: what can still be dredged up today is gone tomorrow."""
    ctx = _ctx([("Depth beats speed.", "What beats speed?")])
    assert digest.FLESH_NUDGE in digest.render_text(ctx)
    assert digest.FLESH_NUDGE in digest.render_html(ctx)


def test_quiz_items_asks_yesterday_first():
    ctx = _ctx([("Fresh.", "Fresh cue?")], [_recalled("Older.", "Older cue?")])
    items = digest.quiz_items(ctx)
    assert [i["text"] for i in items] == ["Fresh.", "Older."]
    assert items[0]["fresh"] and not items[1]["fresh"]


def test_subject_counts_the_questions():
    assert digest.subject_for(_ctx([("a", "a?"), ("b", "b?")])).startswith("Recall · 2 questions")
    assert digest.subject_for(_ctx([("a", "a?")])).startswith("Recall · 1 question from")


# ── send_daily ────────────────────────────────────────────────────────────────


def test_send_daily_skips_without_a_configured_mailer(db):
    player = state.get_or_create_player(db)
    out = digest.send_daily(db, player, DAY)
    assert out["status"] == "skipped" and out["detail"] == "mailer not configured"


def test_send_daily_skips_an_empty_day(db, monkeypatch):
    player = state.get_or_create_player(db)
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    out = digest.send_daily(db, player, DAY)
    assert out["status"] == "skipped" and out["detail"] == "nothing logged"


def test_send_daily_still_sends_a_day_with_no_learnings_but_a_record(db, monkeypatch):
    """A day of quests and spending is worth an email even with nothing to recall —
    the recap is the record of it."""
    player = state.get_or_create_player(db)
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    sent = {}
    monkeypatch.setattr(digest.mailer, "send", lambda s, h, t, **_k: sent.update(subject=s, text=t))
    db.add(Completion(player_id=player.id, quest_id="d-train", xp=10, day=DAY))
    db.commit()

    out = digest.send_daily(db, player, DAY)
    assert out["status"] == "sent"
    assert "THE DAY ITSELF" in sent["text"] and "1 quest finished" in sent["text"]


def test_send_daily_sends_once_and_then_skips(db, monkeypatch):
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "Depth beats speed.")
    sent = []
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    monkeypatch.setattr(digest.mailer, "send", lambda s, h, t, **_k: sent.append(s) or {"id": "1"})

    first = digest.send_daily(db, player, DAY)
    assert first["status"] == "sent" and first["highlight_count"] == 1

    second = digest.send_daily(db, player, DAY)
    assert second["status"] == "skipped" and second["detail"] == "already sent"
    assert len(sent) == 1  # the scheduled job and a manual send can't double-mail


def test_send_daily_force_resends(db, monkeypatch):
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "Depth beats speed.")
    sent = []
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    monkeypatch.setattr(digest.mailer, "send", lambda s, h, t, **_k: sent.append(s) or {"id": "1"})

    digest.send_daily(db, player, DAY)
    digest.send_daily(db, player, DAY, force=True)
    assert len(sent) == 2


def test_send_daily_records_a_failure_and_reraises(db, monkeypatch):
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "Depth beats speed.")
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)

    def _fail(*_a, **_k):
        raise TimeoutError("no route to host")

    monkeypatch.setattr(digest.mailer, "send", _fail)
    try:
        digest.send_daily(db, player, DAY)
        raise AssertionError("expected the transport error to propagate")
    except TimeoutError:
        pass

    run = db.get(digest.DigestRun, {"player_id": player.id, "day": DAY})
    assert run.status == "failed" and run.detail == "TimeoutError"


def test_why_includes_the_http_status_and_body():
    """A bare exception name is useless at 7am — the status is what says whether it
    was the key, the recipient, or the service."""
    class FakeHTTPError(Exception):
        code = 403

        def read(self):
            return b"error code: 1010"

    assert digest._why(FakeHTTPError()) == "FakeHTTPError 403: error code: 1010"


def test_why_survives_an_unreadable_body():
    class Weird(Exception):
        code = 500

        def read(self):
            raise OSError("stream already consumed")

    assert digest._why(Weird()) == "Weird 500"


def test_a_failed_run_can_be_retried_without_force(db, monkeypatch):
    """A morning that failed must try again — only a *sent* day is skipped."""
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "Depth beats speed.")
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)

    def _fail(*_a, **_k):
        raise TimeoutError("no route to host")

    monkeypatch.setattr(digest.mailer, "send", _fail)
    try:
        digest.send_daily(db, player, DAY)
    except TimeoutError:
        pass

    sent = []
    monkeypatch.setattr(digest.mailer, "send", lambda s, h, t, **_k: sent.append(s) or {"id": "1"})
    assert digest.send_daily(db, player, DAY)["status"] == "sent"
    assert len(sent) == 1


def test_a_failed_send_does_not_burn_a_rung(db, monkeypatch):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(3), "Depth beats speed.")
    row.cue, row.box, row.due = "What beats speed?", 0, DAY
    db.commit()
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)

    def _fail(*_a, **_k):
        raise TimeoutError("no route")

    monkeypatch.setattr(digest.mailer, "send", _fail)
    try:
        digest.send_daily(db, player, DAY)
    except TimeoutError:
        pass

    db.refresh(row)
    assert row.box == 0 and row.due == DAY  # asked again tomorrow, same rung


# ── hooks on every answer ─────────────────────────────────────────────────────


def _older(db, player, text, cue, hook="", days_ago=7):
    """A highlight from a past day, due this morning — what the recall half asks."""
    day = (date.fromisoformat(DAY) - timedelta(days=days_ago)).isoformat()
    row = Highlight(player_id=player.id, day=day, text=text, cue=cue, hook=hook,
                    source_label="A book", box=0, due=DAY)
    db.add(row)
    db.commit()
    return row


def _hooker(monkeypatch, hooks: dict, asked: list | None = None):
    def _hooks_for(facts, timeout=30.0):
        if asked is not None:
            asked.append(facts)
        return hooks

    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "hooks_for", _hooks_for)


def test_parse_hooks_keys_by_the_number_sent():
    """By number, not position: a model that skips one or reorders them would hang
    every hook on the wrong fact, which is worse than a fact with no hook."""
    out = llm._parse_hooks(_payload({"hooks": [
        {"n": 2, "hook": "  a scale tipping  "},
        {"n": 1, "hook": "a deep well"},
    ]}))
    assert out == {1: "a deep well", 2: "a scale tipping"}


def test_parse_hooks_drops_what_it_cannot_place():
    out = llm._parse_hooks(_payload({"hooks": [
        "a bare string",
        {"n": "second", "hook": "no usable number"},
        {"n": 3, "hook": "   "},
        {"n": 1, "hook": "kept"},
    ]}))
    assert out == {1: "kept"}


def test_backfill_hooks_gives_older_answers_the_hook_fresh_ones_come_with(db, monkeypatch):
    player = state.get_or_create_player(db)
    _older(db, player, "Losses weigh about twice as much as equal gains.",
           "How do losses weigh against equal gains?")
    asked: list = []
    _hooker(monkeypatch, {1: "a feather on one pan tipping the whole scale"}, asked)

    ctx = digest.build_context(db, player, DAY)
    assert digest.backfill_hooks(db, player, ctx) == 1

    # The email renders from the context, and the row keeps it for every later showing.
    assert "a feather on one pan" in digest.render_text(ctx)
    assert db.query(Highlight).filter_by(player_id=player.id).one().hook.startswith("a feather")
    assert asked[0] == [{
        "text": "Losses weigh about twice as much as equal gains.",
        "cue": "How do losses weigh against equal gains?",
    }]


def test_backfill_hooks_only_asks_about_the_ones_missing_one(db, monkeypatch):
    """The backlog drains and then costs nothing: an answer already hooked is never
    sent up again."""
    player = state.get_or_create_player(db)
    _older(db, player, "Depth beats speed.", "What beats speed?", hook="a deep well",
           days_ago=9)
    _older(db, player, "Attention residue lingers after a switch.",
           "What lingers after switching tasks?", days_ago=7)
    asked: list = []
    _hooker(monkeypatch, {1: "wet paint you keep touching"}, asked)

    ctx = digest.build_context(db, player, DAY)
    digest.backfill_hooks(db, player, ctx)
    assert [f["text"] for f in asked[0]] == ["Attention residue lingers after a switch."]


def test_backfill_hooks_asks_nothing_when_every_answer_has_one(db, monkeypatch):
    player = state.get_or_create_player(db)
    _older(db, player, "Depth beats speed.", "What beats speed?", hook="a deep well")

    def _boom(*_a, **_k):
        raise AssertionError("nothing was missing a hook")

    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "hooks_for", _boom)
    assert digest.backfill_hooks(db, player, digest.build_context(db, player, DAY)) == 0


def test_backfill_hooks_leaves_the_answers_bare_when_it_fails(db, monkeypatch):
    """One unwritten hook is not worth losing the 7am email over."""
    player = state.get_or_create_player(db)
    _older(db, player, "Depth beats speed.", "What beats speed?")
    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "hooks_for",
                        lambda *_a, **_k: (_ for _ in ()).throw(RuntimeError("no quota")))

    ctx = digest.build_context(db, player, DAY)
    problems: list[str] = []
    assert digest.backfill_hooks(db, player, ctx, problems) == 0
    assert problems and "hooks not written" in problems[0]
    assert "What beats speed?" in digest.render_text(ctx)


def test_backfill_hooks_stops_when_the_days_quota_is_gone(db, monkeypatch):
    player = state.get_or_create_player(db)
    _older(db, player, "Depth beats speed.", "What beats speed?")
    _hooker(monkeypatch, {1: "a deep well"})
    llm.note_spend(llm.DAILY_LIMIT)
    assert digest.backfill_hooks(db, player, digest.build_context(db, player, DAY)) == 0


def test_a_preview_writes_no_hooks(db, monkeypatch):
    """build_context is what the app and the preview read, as often as they like."""
    player = state.get_or_create_player(db)
    _older(db, player, "Depth beats speed.", "What beats speed?")

    def _boom(*_a, **_k):
        raise AssertionError("a preview must not spend the allowance")

    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "hooks_for", _boom)
    ctx = digest.build_context(db, player, DAY)
    assert ctx["recall"][0]["hook"] == ""


def test_send_daily_hooks_the_answers_it_is_about_to_ask(db, monkeypatch):
    player = state.get_or_create_player(db)
    _older(db, player, "Losses weigh about twice as much as equal gains.",
           "How do losses weigh against equal gains?")
    _hooker(monkeypatch, {1: "a feather on one pan tipping the whole scale"})
    sent = {}
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    monkeypatch.setattr(digest.mailer, "send", lambda s, h, t, **_k: sent.update(text=t, html=h))

    assert digest.send_daily(db, player, DAY)["status"] == "sent"
    assert "hook: a feather on one pan tipping the whole scale" in sent["text"]
    assert "a feather on one pan tipping the whole scale" in sent["html"]


def test_a_quiet_morning_spends_nothing_on_hooks(db, monkeypatch):
    player = state.get_or_create_player(db)
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    monkeypatch.setattr(llm, "enabled", lambda: True)
    monkeypatch.setattr(llm, "hooks_for",
                        lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("nothing to send")))
    assert digest.send_daily(db, player, DAY)["status"] == "skipped"


# ── cross-day duplicates ──────────────────────────────────────────────────────


def test_quiz_items_drops_an_idea_already_asked():
    """Each day is distilled alone, so two days on one book can land on the same
    idea. Asking it twice burns a rung of the ladder and reads as a bug."""
    ctx = _ctx(
        [("System 1 is fast and automatic; System 2 is slow and effortful.", "Fresh cue?")],
        [_recalled("System 2 is slow and effortful, System 1 fast and automatic.", "Older cue?")],
    )
    items = digest.quiz_items(ctx)
    assert [i["cue"] for i in items] == ["Fresh cue?"]


def test_quiz_items_keeps_genuinely_different_ideas():
    ctx = _ctx(
        [("Loss aversion makes losses hurt twice as much as equal gains.", "a?")],
        [_recalled("The base rate is the background probability before details.", "b?")],
    )
    assert len(digest.quiz_items(ctx)) == 2


def test_too_alike_ignores_shared_filler_words():
    assert not digest._too_alike(
        "This idea is about deliberate practice being hard.",
        "This idea is about sleep being restorative.",
    )


# ── threads — the running summary (marginalia) ────────────────────────────────


def test_update_thread_stores_the_book_without_the_chapters(db, monkeypatch):
    """The panel sits next to the reading card, which shows where you actually are —
    so the sentence is labelled with the book, never one day's chapters."""
    player = state.get_or_create_player(db)
    monkeypatch.setattr(llm, "thread_summary", lambda *a, **k: "Focus compounds.")

    digest.update_thread(
        db, player, DAY, [{"kind": "book", "source": "Deep Work, ch 2-3", "text": ""}], ["a"]
    )
    assert db.query(Thread).one().title == "Deep Work"


def test_thread_for_strips_chapters_off_a_title_written_before_this(db):
    """Rows already in the database were stamped with a day's chapters, and the panel
    has to stop contradicting the reading card for them too."""
    player = state.get_or_create_player(db)
    db.add(Thread(player_id=player.id, key="deep work", title="Deep Work, ch 2-3",
                  summary="Focus compounds.", days=2, day=DAY))
    db.commit()

    assert digest.thread_for(db, player, DAY)["title"] == "Deep Work"


def test_thread_counts_the_sittings_the_reading_card_lists(db, monkeypatch):
    """The two panels have to agree. Folds drift from sittings on any day the reading
    daily was ticked with no chapters logged, so the log wins."""
    player = state.get_or_create_player(db)
    player.current_book = "Deep Work"
    db.add_all([
        ReadingLog(player_id=player.id, day=DAY, book="Deep Work", chapters=2, label="1-2"),
        ReadingLog(player_id=player.id, day=DAY, book="Deep Work", chapters=1, label="3"),
        ReadingLog(player_id=player.id, day="2026-07-19", book="Deep Work", chapters=1, label="4"),
    ])
    db.add(Thread(player_id=player.id, key="deep work", title="Deep Work",
                  summary="Focus compounds.", days=9, day=DAY))
    db.commit()

    assert digest.thread_for(db, player, "2026-07-19")["sittings"] == 3  # not the nine folds
    # The same tally the reading card is made of, so the two panels can't disagree.
    assert reading.tally(reading.logs_of(db, player)).sittings == 3


def test_thread_falls_back_to_folds_for_a_book_with_no_reading_log(db):
    """A book read on the Learn screen never touches the reading log, so the folds are
    the only record of how many times it has been sat with."""
    player = state.get_or_create_player(db)
    db.add(Thread(player_id=player.id, key="how to read a book", title="How to Read a Book",
                  summary="Reading is active.", days=2, day=DAY))
    db.commit()

    assert digest.thread_for(db, player, DAY)["sittings"] == 2


def test_update_thread_recondenses_rather_than_appending(db, monkeypatch):
    player = state.get_or_create_player(db)
    entries = [{"kind": "book", "source": "Deep Work, ch 2", "text": ""}]
    seen = {}

    def _summary(title, previous, lines, **_k):
        seen["previous"] = previous
        return "Focus is a skill that compounds."

    monkeypatch.setattr(llm, "thread_summary", _summary)
    row = digest.update_thread(db, player, DAY, entries, ["Depth beats speed."])
    assert row.summary == "Focus is a skill that compounds." and row.days == 1
    assert seen["previous"] == ""  # first sitting starts from nothing

    # a later day is handed the sentence so far, to rewrite rather than extend
    digest.update_thread(db, player, "2026-07-19", entries, ["Shallow work crowds it out."])
    assert seen["previous"] == "Focus is a skill that compounds."
    assert db.query(Thread).one().days == 2


def test_update_thread_is_once_a_day(db, monkeypatch):
    player = state.get_or_create_player(db)
    entries = [{"kind": "book", "source": "Deep Work", "text": ""}]
    calls = []
    monkeypatch.setattr(llm, "thread_summary",
                        lambda *a, **k: calls.append(1) or "One sentence.")

    digest.update_thread(db, player, DAY, entries, ["a"])
    digest.update_thread(db, player, DAY, entries, ["b"])
    assert len(calls) == 1


def test_update_thread_will_not_fold_a_day_older_than_the_last_one(db, monkeypatch):
    """A repair reaching back must not rewrite the sentence with older reading."""
    player = state.get_or_create_player(db)
    entries = [{"kind": "book", "source": "Deep Work", "text": ""}]
    calls = []
    monkeypatch.setattr(llm, "thread_summary",
                        lambda *a, **k: calls.append(1) or "The later sentence.")
    digest.update_thread(db, player, "2026-07-20", entries, ["a"])

    row = digest.update_thread(db, player, "2026-07-18", entries, ["older"])
    assert len(calls) == 1  # the older day was never asked about
    assert row.summary == "The later sentence." and row.day == "2026-07-20"


def test_update_thread_keeps_the_old_sentence_when_the_llm_fails(db, monkeypatch):
    """Losing a morning is fine; losing the thread is not."""
    player = state.get_or_create_player(db)
    entries = [{"kind": "book", "source": "Deep Work", "text": ""}]
    monkeypatch.setattr(llm, "thread_summary", lambda *a, **k: "Focus compounds.")
    digest.update_thread(db, player, DAY, entries, ["a"])

    def _boom(*_a, **_k):
        raise TimeoutError("no route")

    monkeypatch.setattr(llm, "thread_summary", _boom)
    row = digest.update_thread(db, player, "2026-07-20", entries, ["b"])
    assert row.summary == "Focus compounds." and row.days == 1


def test_update_thread_ignores_days_with_no_book(db, monkeypatch):
    player = state.get_or_create_player(db)
    monkeypatch.setattr(llm, "thread_summary", lambda *a, **k: "nope")
    assert digest.update_thread(
        db, player, DAY, [{"kind": "reflection", "source": "", "text": "x"}], ["a"]
    ) is None
    assert db.query(Thread).count() == 0


def test_thread_for_ignores_a_summary_from_the_future(db):
    """A digest rebuilt for an older day must read as it did that morning."""
    player = state.get_or_create_player(db)
    db.add(Thread(player_id=player.id, key="deep work", title="Deep Work",
                  summary="Later thinking.", days=3, day="2026-07-25"))
    db.commit()
    assert digest.thread_for(db, player, DAY) is None


def test_render_shows_the_running_summary():
    ctx = _ctx([("Depth beats speed.", "What beats speed?")])
    ctx["thread"] = {"title": "Deep Work", "summary": "Focus compounds.", "sittings": 3}
    assert "Focus compounds." in digest.render_text(ctx)
    html = digest.render_html(ctx)
    assert "Focus compounds." in html and "3 sittings" in html



# ── The profile picture in the header ─────────────────────────────────────────

PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg=="


def test_avatar_part_splits_the_stored_data_uri():
    part = digest.avatar_part(PNG)
    assert part["content"] == "iVBORw0KGgoAAAANSUhEUg=="  # base64 only, no data: prefix
    assert part["content_type"] == "image/png"
    assert part["filename"] == "avatar.png"
    assert part["content_id"] == digest.AVATAR_CID  # what src="cid:…" points at


def test_avatar_part_names_a_jpeg_sensibly():
    assert digest.avatar_part("data:image/jpeg;base64,AAAA")["filename"] == "avatar.jpg"


def test_avatar_part_ignores_anything_unusable():
    """A picture is the least important thing in the email — a malformed one is
    dropped rather than risking the send."""
    for bad in ("", "   ", "https://example.com/me.png", "data:image/png;base64,",
                "data:text/plain;base64,AAAA", "not a uri"):
        assert digest.avatar_part(bad) is None


def test_the_header_shows_the_picture_by_content_id_when_sending():
    ctx = {**_ctx(["Depth beats speed."]), "avatar": PNG}
    html = digest.render_html(ctx, avatar_src=digest.AVATAR_SRC)
    assert 'src="cid:arise-avatar"' in html
    assert "base64" not in html  # the bytes travel as a part, never in the markup


def test_the_preview_shows_the_picture_inline_instead():
    """The in-app preview is a browser, not a mail client: cid: resolves to nothing
    there, so with no src passed the stored data URI is used directly."""
    ctx = {**_ctx(["Depth beats speed."]), "avatar": PNG}
    assert PNG in digest.render_html(ctx)


def test_the_header_is_unchanged_when_no_picture_is_set():
    html = digest.render_html(_ctx(["Depth beats speed."]))
    assert "<img" not in html
    assert "Recall" in html and "Saturday, 18 July" in html


def test_send_attaches_the_picture_and_points_the_html_at_it(db, monkeypatch):
    player = state.get_or_create_player(db)
    player.avatar = PNG
    db.commit()
    _highlight(db, player, DAY, "Depth beats speed.")
    seen = {}
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    monkeypatch.setattr(digest.mailer, "send",
                        lambda s, h, t, attachments=None: seen.update(html=h, parts=attachments))

    digest.send_daily(db, player, DAY)
    assert seen["parts"][0]["content_id"] == digest.AVATAR_CID
    assert 'src="cid:arise-avatar"' in seen["html"]


def test_send_carries_no_attachment_without_a_picture(db, monkeypatch):
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "Depth beats speed.")
    seen = {}
    monkeypatch.setattr(digest.mailer, "enabled", lambda: True)
    monkeypatch.setattr(digest.mailer, "send",
                        lambda s, h, t, attachments=None: seen.update(parts=attachments))

    digest.send_daily(db, player, DAY)
    assert seen["parts"] is None


def test_the_email_warns_against_recognising_instead_of_recalling():
    """Oakley's illusion of competence: recognising an answer feels exactly like
    knowing it, so the email has to say produce it first, not just 'have a go'."""
    ctx = _ctx([("Depth beats speed.", "What beats speed?")])
    for rendered in (digest.render_text(ctx), digest.render_html(ctx)):
        assert digest.RECALL_INSTRUCTION in rendered
