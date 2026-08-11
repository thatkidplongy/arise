"""Recall digest: distillation parsing, gathering, the spaced recall picks,
rendering, and the once-per-day send guard. No network, no email."""

import json

import pytest

from app import digest, llm, state
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


# ── recall_set — the spaced part ──────────────────────────────────────────────


def _back(days: int) -> str:
    from datetime import date, timedelta

    return (date.fromisoformat(DAY) - timedelta(days=days)).isoformat()


def test_recall_set_returns_what_has_come_due(db):
    player = state.get_or_create_player(db)
    due = _highlight(db, player, _back(5), "due today")
    due.due, due.box = DAY, 1
    later = _highlight(db, player, _back(5), "not due for a while")
    later.due, later.box = _back(-10), 3  # ten days from now
    db.commit()

    picks = digest.recall_set(db, player, DAY)
    assert [p["text"] for p in picks] == ["due today"]


def test_recall_set_takes_the_most_overdue_first(db):
    player = state.get_or_create_player(db)
    for n in (1, 9, 4):
        row = _highlight(db, player, _back(20), f"due {n} days ago")
        row.due = _back(n)
    db.commit()

    picks = digest.recall_set(db, player, DAY)
    assert [p["text"] for p in picks][0] == "due 9 days ago"  # nothing rots at the bottom


def test_recall_set_caps_a_backlog(db):
    """A month away shouldn't produce a wall of questions on the first morning back."""
    player = state.get_or_create_player(db)
    for i in range(20):
        row = _highlight(db, player, _back(30), f"line {i}")
        row.due = _back(10)
    db.commit()

    assert len(digest.recall_set(db, player, DAY)) == digest.PER_DIGEST


def test_recall_set_is_a_pure_read(db):
    """Looking must never advance the ladder — only a sent digest does that."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(5), "due today")
    row.due, row.box = DAY, 1
    db.commit()

    digest.recall_set(db, player, DAY)
    digest.recall_set(db, player, DAY)
    db.refresh(row)
    assert row.box == 1 and row.due == DAY


def test_recall_set_backfills_a_missing_due_date(db):
    """Highlights distilled before scheduling existed still have to enter the rotation."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(9), "from before scheduling")
    row.due = ""
    db.commit()

    assert [p["text"] for p in digest.recall_set(db, player, DAY)] == ["from before scheduling"]
    db.refresh(row)
    assert row.due == _back(8)  # its own day + the first rung, not today


def test_recall_set_ignores_the_day_itself(db):
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "learned today")
    assert digest.recall_set(db, player, DAY) == []


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


def test_quizzable_skips_highlights_with_no_cue():
    assert digest.quizzable([_recalled("a", ""), _recalled("b", "b?")]) == [_recalled("b", "b?")]


def test_subject_counts_the_questions():
    assert digest.subject_for(_ctx([("a", "a?"), ("b", "b?")])).startswith("Recall · 2 questions")
    assert digest.subject_for(_ctx([("a", "a?")])).startswith("Recall · 1 question from")


def test_interleave_separates_consecutive_sources():
    """Blocked practice reads smoothly and sticks less — mixing forces you to work out
    what kind of thing is being asked before you can answer it."""
    picks = [
        {"source_label": "Book A", "text": "1"},
        {"source_label": "Book A", "text": "2"},
        {"source_label": "Book B", "text": "3"},
    ]
    out = digest._interleave(picks)
    assert [p["source_label"] for p in out] == ["Book A", "Book B", "Book A"]


def test_interleave_is_stable_when_everything_shares_a_source():
    picks = [{"source_label": "A", "text": str(i)} for i in range(3)]
    assert [p["text"] for p in digest._interleave(picks)] == ["0", "1", "2"]


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


def test_thread_key_strips_chapter_markers():
    """Every sitting on one book must land on the same thread, however it was typed."""
    assert digest.thread_key("Deep Work, ch 2") == "deep work"
    assert digest.thread_key("Deep Work ch. 2-3") == "deep work"
    assert digest.thread_key("Deep Work pp 40-52") == "deep work"
    assert digest.thread_key("Deep Work") == "deep work"
    assert digest.thread_key("Thinking, Fast and Slow, chapter 4") == "thinking, fast and slow"


def test_thread_key_keeps_a_number_that_is_part_of_the_title():
    assert digest.thread_key("Catch 22") == "catch 22"


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
    ctx["thread"] = {"title": "Deep Work", "summary": "Focus compounds.", "days": 3}
    assert "Focus compounds." in digest.render_text(ctx)
    html = digest.render_html(ctx)
    assert "Focus compounds." in html and "3 sittings" in html


# ── Leitner grading ───────────────────────────────────────────────────────────


def test_grade_got_pushes_it_further_out(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    row.box, row.due = 1, DAY
    db.commit()

    out = digest.grade(db, player, row.id, "got", DAY)
    assert out["box"] == 2
    db.refresh(row)
    assert row.due == _back(-digest.RECALL_INTERVALS[2])  # box 2 → 7 days on


def test_grade_missed_brings_it_back_tomorrow(db):
    """No clue goes near the front of the pile, not the back."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    row.box, row.due = 4, DAY
    db.commit()

    digest.grade(db, player, row.id, "missed", DAY)
    db.refresh(row)
    assert row.box == 0 and row.due == _back(-1)


def test_grade_shaky_holds_the_spacing(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    row.box, row.due = 2, DAY
    db.commit()

    digest.grade(db, player, row.id, "shaky", DAY)
    db.refresh(row)
    assert row.box == 2 and row.due == _back(-digest.RECALL_INTERVALS[2])


def test_grade_rejects_an_unknown_value(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    with pytest.raises(ValueError):
        digest.grade(db, player, row.id, "brilliant", DAY)


def test_grade_ignores_someone_elses_highlight(db):
    from app.models import Player

    player = state.get_or_create_player(db)
    other = Player(name="Someone Else")
    db.add(other)
    db.commit()
    row = _highlight(db, other, DAY, "Depth beats speed.")

    assert digest.grade(db, player, row.id, "got", DAY) is None


def test_grade_is_none_for_an_unknown_highlight(db):
    player = state.get_or_create_player(db)
    assert digest.grade(db, player, "no-such-id", "got", DAY) is None


def test_interval_stops_climbing_past_the_last_rung():
    """Recalled five times running doesn't need a sixth schedule."""
    last = digest.RECALL_INTERVALS[-1]
    assert digest.interval_for(len(digest.RECALL_INTERVALS)) == last
    assert digest.interval_for(99) == last


def test_advance_shown_climbs_the_ladder_without_grading(db):
    """Never grading anything must reproduce the plain expanding ladder."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(3), "Depth beats speed.")
    row.box, row.due = 0, DAY
    db.commit()

    digest.advance_shown(db, player, DAY, [{"id": row.id}])
    db.refresh(row)
    assert row.box == 1 and row.due == _back(-digest.RECALL_INTERVALS[1])


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
