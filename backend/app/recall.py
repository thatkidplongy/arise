"""Spaced recall: the index-card pile, and the ladder that decides when a card returns.

Every distilled Highlight is a card — a question on the front, the answer you wrote
on the back. Cards sit in Leitner boxes: being met moves one up a rung, missing it
drops it to the first, and each rung is roughly twice the last (RECALL_INTERVALS),
because forgetting is steepest in the first days.

Two surfaces read from here and neither owns the schedule. The Learn screen sits
you down with one stack at a time (`library`, `due_set`), and the morning email
asks a handful across every source (`due_set` again, interleaved). Both are pure
derive-on-read — same day, same picks — so looking costs nothing. Only two things
actually move a card: `grade`, when you say how close you were, and `advance_shown`,
once a digest has genuinely been sent. That split is what lets the app preview and
re-render as often as it likes without quietly burning through the ladder.

Distilling lives in digest.py, which makes the cards this module then schedules.
"""

import random
from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import reading
from .models import Highlight, Learning, Player

# An expanding ladder, not evenly spaced: forgetting is steepest in the first days,
# so the early touches sit close together and later ones stretch out. Each rung is
# roughly twice the last.
RECALL_INTERVALS = (1, 3, 7, 16, 35)
# Five questions is a few minutes of real effort; ten is homework, and homework is
# what stops getting done. A backlog waits its turn rather than arriving at once.
PER_DIGEST = 5


def interval_for(box: int) -> int:
    """Days until a highlight in `box` comes back. Past the last rung it stays there
    — something recalled five times running doesn't need a sixth schedule."""
    return RECALL_INTERVALS[min(max(box, 0), len(RECALL_INTERVALS) - 1)]


def due_after(day: str, box: int) -> str:
    return (date.fromisoformat(day) + timedelta(days=interval_for(box))).isoformat()


def _backfill_due(db: Session, player: Player) -> None:
    """Give a due date to highlights distilled before scheduling existed. Spread by
    their own age rather than set to today, so a long backlog doesn't all come due in
    one morning."""
    rows = db.query(Highlight).filter(
        Highlight.player_id == player.id, Highlight.due == ""
    ).all()
    if not rows:
        return
    for r in rows:
        r.box = r.box or 0
        r.due = due_after(r.day, r.box)
    db.commit()


def due_set(db: Session, player: Player, day: str) -> list[dict]:
    """The highlights that have come due — the spaced half of the digest.

    Leitner: every highlight sits in a box, each box further from the last. Being
    shown moves it up one; grading it as missed drops it back to the first, so it
    returns tomorrow rather than in a month. Oldest-due first, so nothing rots at the
    bottom of the pile.

    A read never advances anything — only `advance_shown`, once a digest is actually
    sent — so preview and the app can look as often as they like."""
    _backfill_due(db, player)
    rows = (
        db.query(Highlight)
        .filter(
            Highlight.player_id == player.id,
            Highlight.day < day,  # the day's own highlights are the fresh section
            Highlight.due != "",
            Highlight.due <= day,
        )
        .order_by(Highlight.due, Highlight.created_at)
        .limit(PER_DIGEST * 3)  # a pool to interleave from, not the final cut
        .all()
    )
    born = _learnings_for(db, rows)
    picked = [_recall_out(r, day, born) for r in rows]
    return _interleave(picked)[:PER_DIGEST]


def _learnings_for(db: Session, rows: list[Highlight]) -> dict[str, Learning]:
    """The learnings a batch of highlights was distilled from, by id — one query,
    so shaping a whole library doesn't become a query per card."""
    ids = [r.learning_id for r in rows if r.learning_id]
    if not ids:
        return {}
    found = db.query(Learning).filter(Learning.id.in_(ids)).all()
    return {l.id: l for l in found}


def _origin_of(learning: Learning | None) -> str:
    """Where a card was met, as a line for the back of it. Empty when the highlight
    was derived (a reading daily with no note) — there's no story to tell."""
    if learning is None:
        return ""
    if learning.source and learning.text:
        return f"You logged “{learning.source}” and wrote this in your own words."
    if learning.source:
        return f"Distilled from “{learning.source}”, as you logged it."
    return "Distilled from what you logged that day."


def _recall_out(r: Highlight, day: str, born: dict[str, Learning]) -> dict:
    learning = born.get(r.learning_id or "")
    box = r.box or 0
    return {
        "id": r.id,
        "text": r.text,
        "cue": r.cue or "",
        "hook": r.hook or "",
        "box": box,
        "day": r.day,
        "source_label": r.source_label,
        # The label with any chapter marker stripped, so every sitting of one book
        # files under one name when the app sorts the deck into per-book piles —
        # and the marker on its own, for the card's corner tag.
        "material": reading.book_name(r.source_label) if r.source_label else "",
        "chapter": reading.chapter_marker(r.source_label),
        "seen": r.seen or 0,
        # Whether the answer is in the reader's own words — a note was written, not
        # just a source named — and the story of where the card was born.
        "own_words": bool(learning is not None and learning.text),
        "origin": _origin_of(learning),
        # What each grade would do, so the buttons can say it before being pressed.
        "if_missed": interval_for(0),
        "if_shaky": interval_for(box),
        "if_got": interval_for(box + 1),
        "days_ago": (date.fromisoformat(day) - date.fromisoformat(r.day)).days,
    }


def library(db: Session, player: Player, day: str) -> list[dict]:
    """Every highlight ever distilled — the whole shelf, where `due_set` is only
    what the schedule owes today.

    The app's recall card taps through this once the due handful runs out, so
    browsing keeps meeting new material instead of wrapping the same five. Shuffled
    with the day as the seed: newest-first would resurface the same recent lines
    every visit and the old ones would never come up, while a fresh shuffle per read
    would reorder mid-browse. Seeding by day gives each morning its own walk through
    everything, stable for that day.

    A pure read, like `due_set` — browsing never advances the ladder."""
    rows = (
        db.query(Highlight)
        .filter(Highlight.player_id == player.id, Highlight.day <= day)
        .order_by(Highlight.day, Highlight.created_at)  # a stable deck to shuffle from
        .all()
    )
    born = _learnings_for(db, rows)
    out = [_recall_out(r, day, born) for r in rows]
    random.Random(day).shuffle(out)
    return out


def edit(db: Session, player: Player, highlight_id: str, text_value: str) -> dict | None:
    """Rewrite the back of a card. The whole point of the cards is that they're in
    your own words — so the words stay editable after the distiller's first pass.
    The schedule is untouched: better words aren't a recall event."""
    cleaned = text_value.strip()
    if not cleaned:
        raise ValueError("a card can't have a blank back")
    row = db.get(Highlight, highlight_id)
    if row is None or row.player_id != player.id:
        return None
    row.text = cleaned
    db.commit()
    return {"id": row.id}


GRADES = ("got", "shaky", "missed")


def grade(db: Session, player: Player, highlight_id: str, value: str, day: str) -> dict | None:
    """Record how a recall went, and reschedule accordingly.

    Straight from the index-card method: one you knew goes to the back of the pile,
    one you half-knew slides into the middle, one you had no clue about goes near the
    front where you'll meet it again almost immediately."""
    if value not in GRADES:
        raise ValueError(f"grade must be one of {GRADES}")

    row = db.get(Highlight, highlight_id)
    if row is None or row.player_id != player.id:
        return None

    if value == "got":
        row.box = (row.box or 0) + 1
    elif value == "missed":
        row.box = 0
    # 'shaky' leaves the box where it is: seen again at the same spacing, not further.

    row.due = due_after(day, row.box)
    row.seen = (row.seen or 0) + 1
    db.commit()
    return {"id": row.id, "box": row.box, "due": row.due}


def advance_shown(db: Session, player: Player, day: str, items: list[dict]) -> None:
    """Move every highlight the email just asked about up a box.

    This is what keeps the ladder working for someone who never grades anything: a
    plain exposure counts as a pass, which reproduces the fixed 1/3/7/16/35 spacing.
    Grading only ever corrects that guess."""
    for it in items:
        row = db.get(Highlight, it.get("id") or "")
        if row is None or row.player_id != player.id:
            continue
        row.box = (row.box or 0) + 1
        row.due = due_after(day, row.box)
        row.seen = (row.seen or 0) + 1
    db.commit()


def _interleave(picks: list[dict]) -> list[dict]:
    """Reorder so consecutive cues rarely share a source. Practice blocked by one book
    feels smoother and sticks less: mixing forces you to work out *what kind* of thing
    is being asked before you can answer it, which is most of the work in real recall.

    Greedy and order-stable — no randomness, so a given day always renders the same."""
    remaining = list(picks)
    out: list[dict] = []
    while remaining:
        prev = out[-1]["source_label"] if out else None
        nxt = next((p for p in remaining if p["source_label"] != prev), remaining[0])
        remaining.remove(nxt)
        out.append(nxt)
    return out

def quizzable(recall: list[dict]) -> list[dict]:
    """The recall picks that can actually be asked. Highlights distilled before cues
    existed have none, and a highlight without a question is better left out than
    asked with one made up on the spot."""
    return [r for r in recall if r.get("cue")]
