#!/usr/bin/env python3
"""Repair the running book summaries that a day-level attribution contaminated.

update_thread used to fold a whole day's distilled lines into whichever book the
day named first, so a book's running sentence could be written out of another
source's material. It folds only the book's own lines now, but the sentences
already written stay wrong — and worse, each fold recondenses *from the previous
sentence*, so the contamination propagates forward on its own.

What each thread gets is decided here by hand, not sniffed from the text:

  drop     — the thread owns none of its own lines. Every sentence it ever had was
             written from other sources; there is nothing to rebuild it from and
             nothing true to keep.
  rebuild  — the thread owns lines, but its sentence was written from a wider pool.
             Recondensed from its own cards alone, in one call.

Anything not named here is reported and left alone.

Dry run:  python scripts/repair_threads.py
Apply:    python scripts/repair_threads.py --write

Costs one model request per rebuild (3 against the daily budget, which is what a
retry-able call reserves). Run it when the day's digest is not about to go out.
"""

import os
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))


def _load_env() -> None:
    """Read backend/.env the way the launchd service does — this script needs the
    model key, and unlike send_digest.py there is no running process to hand it to."""
    path = BACKEND_DIR / ".env"
    if not path.exists():
        return
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip())


_load_env()

from app import llm, reading  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import Highlight, Thread  # noqa: E402

# thread key → (action, why). Checked by hand against what each thread owns.
PLAN = {
    "meditations": (
        "drop",
        "owns no lines of its own — the sentence described compounding and emergency "
        "funds, which is a money quest's notes, not Meditations",
    ),
    "thinking, fast and slow": (
        "rebuild",
        "the sentence carried the money quest's language ('building financial "
        "resilience') into a summary of the book",
    ),
}


def _own_lines(db, thread: Thread) -> list[str]:
    """The book's own distilled lines, oldest first — matched on the label each card
    carries, the way a title is matched everywhere else."""
    rows = (
        db.query(Highlight)
        .filter_by(player_id=thread.player_id)
        .order_by(Highlight.day, Highlight.created_at)
        .all()
    )
    return [r.text for r in rows if reading.book_key(r.source_label or "") == thread.key]


def main() -> int:
    write = "--write" in sys.argv
    db = SessionLocal()
    threads = db.query(Thread).order_by(Thread.key).all()
    if write and not llm.enabled():
        print("No model key — a rebuild needs one. Nothing written.")
        return 1

    changed = 0
    for row in threads:
        action, why = PLAN.get(row.key, ("keep", "not implicated"))
        lines = _own_lines(db, row)
        print(f"\n{row.key!r} — {len(lines)} of its own lines, {row.days} sitting(s)")
        print(f"  {action.upper()}: {why}")

        if action == "keep":
            continue
        if action == "drop":
            if lines:
                print(f"  SKIPPED: it owns {len(lines)} lines after all — re-check the plan.")
                continue
            print(f"  was: {row.summary[:120]}...")
            if write:
                db.delete(row)
                changed += 1
            continue
        if not lines:
            print("  SKIPPED: nothing of its own to rebuild from.")
            continue

        title = reading.book_name(row.title)
        print(f"  was: {row.summary[:120]}...")
        if not write:
            print(f"  would recondense {len(lines)} lines under {title!r} (1 request)")
            continue
        try:
            summary = llm.thread_summary(title, "", lines)
        except Exception as err:
            print(f"  FAILED: {type(err).__name__} — keeping the old sentence.")
            continue
        if not summary:
            print("  FAILED: empty summary — keeping the old sentence.")
            continue
        row.title, row.summary = title, summary
        changed += 1
        print(f"  now: {summary[:200]}...")

    if not write:
        print("\nDry run — nothing written. Re-run with --write to apply.")
        return 0
    db.commit()
    print(f"\nRepaired {changed} thread(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
