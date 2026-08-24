"""Spaced recall: which cards come due, the whole shelf, and the Leitner ladder
that grading moves. No network, no email — see test_digest.py for the morning send."""

import pytest

from app import recall, state
from app.models import Highlight, Learning

DAY = "2026-07-18"


def _highlight(db, player, day, text):
    row = Highlight(player_id=player.id, day=day, text=text, source_label="A book")
    db.add(row)
    db.commit()
    return row


# ── due_set — what the schedule owes today ───────────────────────────────────


def _back(days: int) -> str:
    from datetime import date, timedelta

    return (date.fromisoformat(DAY) - timedelta(days=days)).isoformat()


def test_due_set_returns_what_has_come_due(db):
    player = state.get_or_create_player(db)
    due = _highlight(db, player, _back(5), "due today")
    due.due, due.box = DAY, 1
    later = _highlight(db, player, _back(5), "not due for a while")
    later.due, later.box = _back(-10), 3  # ten days from now
    db.commit()

    picks = recall.due_set(db, player, DAY)
    assert [p["text"] for p in picks] == ["due today"]


def test_due_set_takes_the_most_overdue_first(db):
    player = state.get_or_create_player(db)
    for n in (1, 9, 4):
        row = _highlight(db, player, _back(20), f"due {n} days ago")
        row.due = _back(n)
    db.commit()

    picks = recall.due_set(db, player, DAY)
    assert [p["text"] for p in picks][0] == "due 9 days ago"  # nothing rots at the bottom


def test_due_set_caps_a_backlog(db):
    """A month away shouldn't produce a wall of questions on the first morning back."""
    player = state.get_or_create_player(db)
    for i in range(20):
        row = _highlight(db, player, _back(30), f"line {i}")
        row.due = _back(10)
    db.commit()

    assert len(recall.due_set(db, player, DAY)) == recall.PER_DIGEST


def test_due_set_is_a_pure_read(db):
    """Looking must never advance the ladder — only a sent digest does that."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(5), "due today")
    row.due, row.box = DAY, 1
    db.commit()

    recall.due_set(db, player, DAY)
    recall.due_set(db, player, DAY)
    db.refresh(row)
    assert row.box == 1 and row.due == DAY


def test_due_set_backfills_a_missing_due_date(db):
    """Highlights distilled before scheduling existed still have to enter the rotation."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(9), "from before scheduling")
    row.due = ""
    db.commit()

    assert [p["text"] for p in recall.due_set(db, player, DAY)] == ["from before scheduling"]
    db.refresh(row)
    assert row.due == _back(8)  # its own day + the first rung, not today


def test_due_set_ignores_the_day_itself(db):
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "learned today")
    assert recall.due_set(db, player, DAY) == []


# ── library — the whole shelf ────────────────────────────────────────────────


def test_library_returns_everything_whatever_the_schedule_says(db):
    player = state.get_or_create_player(db)
    due = _highlight(db, player, _back(5), "due today")
    due.due = DAY
    later = _highlight(db, player, _back(5), "not due for a while")
    later.due = _back(-10)  # ten days from now
    db.commit()

    texts = {r["text"] for r in recall.library(db, player, DAY)}
    assert texts == {"due today", "not due for a while"}


def test_library_includes_the_day_itself(db):
    """due_set keeps today's lines out because the digest shows them fresh; the
    shelf is for browsing everything learned, and today belongs to that."""
    player = state.get_or_create_player(db)
    _highlight(db, player, DAY, "learned today")

    out = recall.library(db, player, DAY)
    assert [r["text"] for r in out] == ["learned today"]
    assert out[0]["days_ago"] == 0


def test_library_walks_differently_each_day_but_holds_still_within_one(db):
    """Newest-first would resurface the same recent lines every visit; a fresh
    shuffle per read would reorder mid-browse. Day-seeded gets both right."""
    player = state.get_or_create_player(db)
    for i in range(10):
        _highlight(db, player, _back(i + 1), f"line {i}")

    today = [r["id"] for r in recall.library(db, player, DAY)]
    again = [r["id"] for r in recall.library(db, player, DAY)]
    tomorrow = [r["id"] for r in recall.library(db, player, _back(-1))]
    assert today == again
    assert set(today) == set(tomorrow)
    assert today != tomorrow


def test_recall_items_carry_the_material_they_file_under(db):
    """One book read across many days carries many chapter markers — the material
    strips them, so the app's per-book piles see one name, not one pile per day."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(5), "a line")
    row.source_label = "Thinking, fast and slow, ch 29-30"
    db.commit()

    out = recall.library(db, player, DAY)
    assert out[0]["material"] == "Thinking, fast and slow"


def test_two_sources_on_one_day_file_under_two_materials(db):
    """The shape the Learn shelf sorts by. A day distilled in one pass covers whatever
    was learned that day, so its cards must not share a pile: a money question stamped
    with the book's label turned up inside the book's stack wearing its chapter tag."""
    player = state.get_or_create_player(db)
    book = _highlight(db, player, _back(5), "Rare events are overweighted.")
    book.source_label = "Thinking, fast and slow, ch 29-30"
    money = _highlight(db, player, _back(5), "An emergency fund covers 3-6 months.")
    money.source_label = "Ledger Study"
    db.commit()

    piles = {r["text"]: r["material"] for r in recall.library(db, player, DAY)}
    assert piles["Rare events are overweighted."] == "Thinking, fast and slow"
    assert piles["An emergency fund covers 3-6 months."] == "Ledger Study"
    assert len(set(piles.values())) == 2


def test_library_is_a_pure_read(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(5), "on the shelf")
    row.due, row.box = DAY, 1
    db.commit()

    recall.library(db, player, DAY)
    db.refresh(row)
    assert row.box == 1 and row.due == DAY


# ── Leitner grading ───────────────────────────────────────────────────────────


def test_grade_got_pushes_it_further_out(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    row.box, row.due = 1, DAY
    db.commit()

    out = recall.grade(db, player, row.id, "got", DAY)
    assert out["box"] == 2
    db.refresh(row)
    assert row.due == _back(-recall.RECALL_INTERVALS[2])  # box 2 → 7 days on


def test_grade_missed_brings_it_back_tomorrow(db):
    """No clue goes near the front of the pile, not the back."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    row.box, row.due = 4, DAY
    db.commit()

    recall.grade(db, player, row.id, "missed", DAY)
    db.refresh(row)
    assert row.box == 0 and row.due == _back(-1)


def test_grade_shaky_holds_the_spacing(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    row.box, row.due = 2, DAY
    db.commit()

    recall.grade(db, player, row.id, "shaky", DAY)
    db.refresh(row)
    assert row.box == 2 and row.due == _back(-recall.RECALL_INTERVALS[2])


def test_grading_counts_as_a_meeting_whatever_the_grade(db):
    """`seen` only ever counts up — a miss drops the box, not the history."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    recall.grade(db, player, row.id, "got", DAY)
    recall.grade(db, player, row.id, "missed", DAY)
    db.refresh(row)
    assert row.seen == 2


def test_a_sent_digest_counts_as_a_meeting_too(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(5), "Depth beats speed.")
    recall.advance_shown(db, player, DAY, [{"id": row.id}])
    db.refresh(row)
    assert row.seen == 1


def test_edit_rewrites_the_back_without_touching_the_schedule(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(5), "the distiller's words")
    row.box, row.due = 2, DAY
    db.commit()

    assert recall.edit(db, player, row.id, "  my own words  ") is not None
    db.refresh(row)
    assert row.text == "my own words"
    assert row.box == 2 and row.due == DAY


def test_edit_refuses_a_blank_back(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(5), "keep me")
    with pytest.raises(ValueError):
        recall.edit(db, player, row.id, "   ")


def test_recall_out_carries_the_cards_face_details(db):
    """Chapter tag, meeting count, provenance and the grade previews — everything
    the card wears comes shaped from here, not recomputed by the app."""
    player = state.get_or_create_player(db)
    learning = Learning(player_id=player.id, day=_back(5), kind="book",
                        source="Deep Work, ch 3", text="my note in my words")
    db.add(learning)
    db.commit()
    row = _highlight(db, player, _back(5), "a line")
    row.source_label, row.learning_id, row.box, row.seen = "Deep Work, ch 3", learning.id, 1, 3
    db.commit()

    out = recall.library(db, player, DAY)[0]
    assert out["chapter"] == "ch 3"
    assert out["seen"] == 3
    assert out["own_words"] is True
    assert "Deep Work, ch 3" in out["origin"]
    assert out["if_missed"] == recall.RECALL_INTERVALS[0]
    assert out["if_shaky"] == recall.RECALL_INTERVALS[1]
    assert out["if_got"] == recall.RECALL_INTERVALS[2]


def test_a_derived_highlight_has_no_origin_story(db):
    player = state.get_or_create_player(db)
    _highlight(db, player, _back(5), "a derived line")
    out = recall.library(db, player, DAY)[0]
    assert out["origin"] == ""
    assert out["own_words"] is False


def test_grade_rejects_an_unknown_value(db):
    player = state.get_or_create_player(db)
    row = _highlight(db, player, DAY, "Depth beats speed.")
    with pytest.raises(ValueError):
        recall.grade(db, player, row.id, "brilliant", DAY)


def test_grade_ignores_someone_elses_highlight(db):
    from app.models import Player

    player = state.get_or_create_player(db)
    other = Player(name="Someone Else")
    db.add(other)
    db.commit()
    row = _highlight(db, other, DAY, "Depth beats speed.")

    assert recall.grade(db, player, row.id, "got", DAY) is None


def test_grade_is_none_for_an_unknown_highlight(db):
    player = state.get_or_create_player(db)
    assert recall.grade(db, player, "no-such-id", "got", DAY) is None


def test_interval_stops_climbing_past_the_last_rung():
    """Recalled five times running doesn't need a sixth schedule."""
    last = recall.RECALL_INTERVALS[-1]
    assert recall.interval_for(len(recall.RECALL_INTERVALS)) == last
    assert recall.interval_for(99) == last


def test_advance_shown_climbs_the_ladder_without_grading(db):
    """Never grading anything must reproduce the plain expanding ladder."""
    player = state.get_or_create_player(db)
    row = _highlight(db, player, _back(3), "Depth beats speed.")
    row.box, row.due = 0, DAY
    db.commit()

    recall.advance_shown(db, player, DAY, [{"id": row.id}])
    db.refresh(row)
    assert row.box == 1 and row.due == _back(-recall.RECALL_INTERVALS[1])


# ── mixing the pile ───────────────────────────────────────────────────────────


def test_quizzable_skips_highlights_with_no_cue():
    """A highlight without a question is better left out than asked with one made
    up on the spot."""
    picks = [{"text": "a", "cue": ""}, {"text": "b", "cue": "b?"}]
    assert recall.quizzable(picks) == [{"text": "b", "cue": "b?"}]


def test_interleave_separates_consecutive_sources():
    """Blocked practice reads smoothly and sticks less — mixing forces you to work out
    what kind of thing is being asked before you can answer it."""
    picks = [
        {"source_label": "Book A", "text": "1"},
        {"source_label": "Book A", "text": "2"},
        {"source_label": "Book B", "text": "3"},
    ]
    out = recall._interleave(picks)
    assert [p["source_label"] for p in out] == ["Book A", "Book B", "Book A"]


def test_interleave_is_stable_when_everything_shares_a_source():
    picks = [{"source_label": "A", "text": str(i)} for i in range(3)]
    assert [p["text"] for p in recall._interleave(picks)] == ["0", "1", "2"]

