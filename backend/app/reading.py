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

import re
from typing import NamedTuple

from sqlalchemy.orm import Session

from .models import Player, ReadingLog

# 'Deep Work, ch 2', 'Deep Work ch. 2-3', 'Deep Work pp 40-52' → all the same book.
# The marker must follow a separator, or the 'ch' inside a title like 'Catch 22'
# would be read as a chapter and the book would become 'Cat'.
_CHAPTER_MARKER = re.compile(
    r"(?:[,;:]\s*|\s+)(?:ch|chap|chapter|chapters|p|pp|page|pages)\.?\s*\d.*$", re.I
)

_CHAPTER_NUMBER = re.compile(r"\d+")


def book_name(source: str) -> str:
    """The book on its own, with the chapter marker a day's source carries stripped
    off: 'Deep Work, ch 2' → 'Deep Work'.

    Anything named after a book — a thread's title, a learning's source — is about
    the whole book, so keeping one day's chapters in the name both dates it and
    contradicts the reading card, which is where you actually are."""
    return " ".join(_CHAPTER_MARKER.sub("", source).split()).strip(" ,;:-–")


def chapter_marker(source: str) -> str:
    """The complement of `book_name`: just the chapter marker a source carries.
    'Deep Work, ch 2' → 'ch 2'; empty when the source names no chapters. The recall
    card wears this as its corner tag, so the book's own name isn't repeated."""
    found = _CHAPTER_MARKER.search(source)
    if found is None:
        return ""
    return " ".join(found.group(0).split()).strip(" ,;:-–")


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
