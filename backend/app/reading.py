"""Reading, derived in one place.

Two panels answer "how far into this book am I?" — the reading card on Learn, and
the running sentence under "The book so far". They used to answer it from different
sources and disagreed: the card read the reading log live while the sentence carried
whatever the overnight digest last stamped on the thread, so one said ch 34-35 while
the other still said ch 31-32, and one counted eight sittings while the other counted
nine folds. Every name and number either of them shows is derived here now, so they
can only agree.

A leaf on purpose: state.py imports digest.py, so neither of them could own this and
both had grown their own copy. Reads only — sittings are written in service.py.
"""

import math
import re

from datetime import date, timedelta
from typing import NamedTuple

from sqlalchemy.orm import Session

from .models import Player, ReadingLog

# 'Deep Work, ch 2', 'Deep Work ch. 2-3', 'Deep Work pp 40-52' → all the same book.
# The marker must follow a separator, or the 'ch' inside a title like 'Catch 22'
# would be read as a chapter and the book would become 'Cat'.
# The words that introduce a marker, and the numbering that can follow one — a
# chapter, a range, or a list of either ('ch 2', 'pp 40-52', 'ch 33, 34-35, 36-37').
# 'Book' is a chapter by another name: Meditations is twelve books, not chapters, so
# 'Meditations, Book 9' is the same book as 'Meditations, ch 8' and not a second one.
_MARKER_WORDS = r"(?:ch|chap|chapter|chapters|book|books|p|pp|page|pages)\.?\s*"
_MARKER_RANGE = r"\d+(?:\s*[-–—]\s*\d+)?"

_CHAPTER_MARKER = re.compile(rf"(?:[,;:]\s*|\s+){_MARKER_WORDS}\d.*$", re.I)

_CHAPTER_NUMBER = re.compile(r"\d+")

# Inside a marker, the part that actually names chapters. Prose after the numbers is
# not part of it — a Notion page called 'DDIA ch 1 — Reliable, Scalable and
# Maintainable Applications' names one chapter and then titles it, and the title is
# neither the book's name nor the marker's.
_MARKER_NUMBERS = re.compile(
    rf"{_MARKER_WORDS}{_MARKER_RANGE}(?:\s*,\s*{_MARKER_RANGE})*", re.I
)


def book_name(source: str) -> str:
    """The book on its own, with the chapter marker a day's source carries stripped
    off: 'Deep Work, ch 2' → 'Deep Work'.

    Anything named after a book — a thread's title, a learning's source — is about
    the whole book, so keeping one day's chapters in the name both dates it and
    contradicts the reading card, which is where you actually are."""
    return " ".join(_CHAPTER_MARKER.sub("", source).split()).strip(" ,;:-–")


def chapter_marker(source: str) -> str:
    """The chapter marker a source carries. 'Deep Work, ch 2' → 'ch 2'; empty when the
    source names no chapters. The recall card wears this as its corner tag, so the
    book's own name isn't repeated.

    Not quite the complement of `book_name`, and deliberately: `book_name` strips from
    the marker to the end of the label, because whatever follows is that sitting's
    business and not the book's — that's what turns both DDIA pages into one 'DDIA'
    pile. The tag keeps only the marker itself, so a chapter's title doesn't end up
    printed in the corner of every card drawn from it."""
    found = _CHAPTER_MARKER.search(source)
    if found is None:
        return ""
    numbered = _MARKER_NUMBERS.search(found.group(0))
    if numbered is None:
        return ""
    return " ".join(numbered.group(0).split()).strip(" ,;:-–")


def book_key(source: str) -> str:
    """`book_name` folded for comparison — so every sitting on one book lands on the
    same thread, and a re-spelled title still finds its own sittings.

    `lower` rather than `casefold` because this is stored (Thread.key): folding an
    existing key differently would orphan the sentence written against it."""
    return book_name(source).lower()


def furthest_chapter(label: str, total: int = 0) -> int:
    """The chapter a label says you reached — the highest number in it. "21–22" means
    you're 22 chapters into the book, not 2, which is how anyone reading it would
    describe where they are. 0 when the label names no chapter ("the intro").

    Clamped to the book's length when known, so a stray number in a label can't
    claim you're past the last chapter."""
    numbers = [int(n) for n in _CHAPTER_NUMBER.findall(label)]
    if not numbers:
        return 0
    reached = max(numbers)
    return min(reached, total) if total > 0 else reached


class Tally(NamedTuple):
    """What a pile of sittings adds up to. Every surface that says how much of a book
    is behind you reads these, so none of them gets to invent its own count."""

    sittings: int  # times you sat down with it
    days: int  # days those sittings fall on
    chapters: int  # how far into the book they put you


def tally(logs: list[ReadingLog], total: int = 0) -> Tally:
    """How far the logged sittings put you into a book.

    The furthest chapter named wins, because that's what "how far through are you"
    means — someone who joins mid-book at ch 21–22 is 22 in, not 2. Sittings logged
    as a bare count still move it, so the count is a floor the furthest chapter can
    only raise: logging ten unlabelled chapters and then naming "ch 2" mustn't wind
    progress back to 2."""
    counted = sum(log.chapters for log in logs)
    named = max((furthest_chapter(log.label, total) for log in logs), default=0)
    return Tally(
        sittings=len(logs),
        days=len({log.day for log in logs}),
        chapters=max(counted, named),
    )


class Pace(NamedTuple):
    """How a book is going, and what that says about finishing it. Every number is
    read off the sittings themselves — the app has never set a reading quota and this
    isn't one either: it's the hunter's own pace, said back to them."""

    started: str       # the day the first sitting was logged
    days_in: int       # calendar days from that day to today, inclusive
    chapters_left: int
    per_week: float    # chapters a week so far, over calendar days not reading days
    days_left: int     # at that pace, how many more days
    finish_by: str     # the day that lands on ('' when there's nothing to project)


def pace(logs: list[ReadingLog], total: int, day: str) -> Pace | None:
    """What the sittings so far say about how long is left, or None when there's
    nothing honest to say — no sittings yet, or a book whose length was never set, so
    there is no 'left' to measure.

    Over calendar days rather than reading days on purpose. 'How long until I finish'
    is asked about real time, and the days a book sits untouched are exactly the ones
    that make the answer longer; counting only the days read would quote a pace the
    hunter has never actually held.

    A book already at or past its last chapter projects zero days rather than a date
    in the past — it's waiting on 'Did you finish it?', not on more reading."""
    if not logs or total <= 0:
        return None
    started = min(log.day for log in logs)
    elapsed = max(1, (date.fromisoformat(day) - date.fromisoformat(started)).days + 1)
    read = tally(logs, total).chapters
    left = max(0, total - read)
    per_day = read / elapsed
    days_left = 0 if left == 0 else (math.ceil(left / per_day) if per_day > 0 else 0)
    finish = date.fromisoformat(day) + timedelta(days=days_left)
    return Pace(
        started=started,
        days_in=elapsed,
        chapters_left=left,
        per_week=round(per_day * 7, 1),
        days_left=days_left,
        finish_by=finish.isoformat() if left == 0 or days_left > 0 else "",
    )


class Book(NamedTuple):
    """One book the reading log knows about, as the shelf shows it."""

    book: str      # the title, as the most recent sitting spelled it
    started: str   # the first day a sitting was logged against it
    last: str      # the most recent such day
    days: int      # calendar days from the first sitting to the last, inclusive
    sittings: int
    chapters: int  # how far in those sittings got


def shelf(logs: list[ReadingLog]) -> list[Book]:
    """Every book the log knows about, the one started longest ago first.

    Grouped the way a person would group them (see `book_key`), so a title that was
    re-spelled mid-book is still one book. `days` is how long it took — or has taken
    so far, for the one being read now — which is the only place the answer to 'how
    long does a book take me' has ever been."""
    by_key: dict[str, list[ReadingLog]] = {}
    for log in sorted(logs, key=lambda r: (r.day, r.created_at)):
        by_key.setdefault(book_key(log.book or ""), []).append(log)
    out: list[Book] = []
    for group in by_key.values():
        days = sorted({log.day for log in group})
        span = (date.fromisoformat(days[-1]) - date.fromisoformat(days[0])).days + 1
        out.append(Book(
            book=book_name(group[-1].book or ""),
            started=days[0],
            last=days[-1],
            days=span,
            sittings=len(group),
            chapters=tally(group).chapters,
        ))
    return sorted(out, key=lambda b: b.started)


def all_logs(db: Session, player_id: str) -> list[ReadingLog]:
    """Every sitting ever logged, oldest first — the whole shelf's raw material."""
    return list(
        db.query(ReadingLog).filter_by(player_id=player_id).order_by(ReadingLog.day, ReadingLog.created_at)
    )


def logs_of_book(db: Session, player_id: str, book: str,
                 since: str | None = None) -> list[ReadingLog]:
    """Every sitting logged against `book`, oldest first.

    Matched on the title the way a person would (see `book_key`), so a corrected
    spelling still finds its own sittings while a genuinely different book inherits
    none of them. `since` is the day the book began: coming back to a title later
    starts from zero rather than picking up where the first pass left off."""
    wanted = book_key(book or "")
    if not wanted:
        return []
    q = db.query(ReadingLog).filter_by(player_id=player_id)
    if since is not None:
        q = q.filter(ReadingLog.day >= since)
    return [r for r in q.order_by(ReadingLog.created_at) if book_key(r.book or "") == wanted]


def logs_of(db: Session, player: Player, since: str | None = None) -> list[ReadingLog]:
    """Every sitting on the book being read now."""
    return logs_of_book(db, player.id, player.current_book, since)


def on_day(logs: list[ReadingLog], day: str) -> list[ReadingLog]:
    """The sittings from one day, in the order they were logged."""
    return [log for log in logs if log.day == day]


def chapter_labels(logs: list[ReadingLog]) -> str:
    """Which chapters these sittings named, as they were typed ('5–7, 8'), or '' when
    none of them named any. A sitting logged as a bare count says nothing about which
    chapters, so it's left out of the label rather than guessed at."""
    return ", ".join(log.label.strip() for log in logs if log.label.strip())
