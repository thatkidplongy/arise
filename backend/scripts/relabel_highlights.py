#!/usr/bin/env python3
"""Re-file the highlights that a day-level source label put in the wrong pile.

Until each highlight came back from the distiller naming the entry it was drawn
from, a whole day's cards were stamped with one label (see digest.source_label).
Two ways that went wrong, and both are in the live data:

  * a day holding a book *and* another quest's notes credited everything to the
    book — so finance cards from 'Ledger Study' turned up inside the Thinking,
    Fast and Slow stack, wearing its chapter tag;
  * a day naming two sources produced 'A · B', which book_name() never splits, so
    both books' cards piled up under one stack named after neither.

The fix in digest.py only helps cards distilled from now on. This re-labels the
ones already written, from a mapping checked by hand against each card's question
— no guessing from keywords, because a wrong move here is invisible afterwards.

Dry run:  python scripts/relabel_highlights.py
Apply:    python scripts/relabel_highlights.py --write

Safe to run while the backend is live: it snapshots first (online-backup API) and
verifies every row still carries the label it was mapped from, so a second run —
or a run against data that has moved on — changes nothing.
"""

import sqlite3
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from backup_db import _db_path  # noqa: E402  (same house rules for finding the db)

WEALTH = "Ledger Study"
TFAS = "Thinking, fast and slow"
DDIA_1 = "DDIA ch 1 — Reliable, Scalable and Maintainable Applications"
DDIA_2 = "DDIA ch 2 — Data Models and Query Languages"

# id prefix → (label it must currently carry, label it should carry, why).
# Every row of a touched day is listed, including the ones that were already right,
# so the table doubles as the record of what was checked.
MAPPING = {
    # 2026-08-11 — the reading sitting, plus a d-wealth note credited to the book.
    "18d8ff0a": (f"{TFAS}, ch 23-24", None, "algorithms over expert judgment — TFAS"),
    "12a11ef1": (f"{TFAS}, ch 23-24", None, "when expert intuition is reliable — TFAS"),
    "e54d612c": (f"{TFAS}, ch 23-24", None, "the outside view — TFAS ch 23"),
    "f886727f": (f"{TFAS}, ch 23-24", None, "premortem — TFAS ch 23"),
    "ff226fb8": (f"{TFAS}, ch 23-24", WEALTH, "APR vs APY — d-wealth"),
    "231273f8": (f"{TFAS}, ch 23-24", WEALTH, "emergency fund sizing — d-wealth"),
    "1a36a324": (f"{TFAS}, ch 23-24", WEALTH, "dividend yield — d-wealth"),

    # 2026-08-12 — a composite label: DDIA notes and the reading sitting.
    "03daa393": (f"{DDIA_1} · {TFAS}, ch 25-26", DDIA_1, "fault vs failure"),
    "ba97707b": (f"{DDIA_1} · {TFAS}, ch 25-26", DDIA_1, "humans and reliability"),
    "cad7e26e": (f"{DDIA_1} · {TFAS}, ch 25-26", DDIA_1, "maintainability economics"),
    "1110466b": (f"{DDIA_1} · {TFAS}, ch 25-26", DDIA_1, "fan-out — scalability"),
    "f28c23c5": (f"{DDIA_1} · {TFAS}, ch 25-26", f"{TFAS}, ch 25-26", "overconfidence"),
    "1b31a3ae": (f"{DDIA_1} · {TFAS}, ch 25-26", f"{TFAS}, ch 25-26", "Bernoulli's errors — ch 25"),
    "d9f61106": (f"{DDIA_1} · {TFAS}, ch 25-26", f"{TFAS}, ch 25-26", "prospect theory — ch 26"),

    # 2026-08-16 — the same composite, a chapter on.
    "b71d7ee5": (f"{DDIA_2} · {TFAS}, ch 27-28", DDIA_2, "choosing a data model"),
    "9a066297": (f"{DDIA_2} · {TFAS}, ch 27-28", DDIA_2, "schema-on-read vs on-write"),
    "9c91b647": (f"{DDIA_2} · {TFAS}, ch 27-28", DDIA_2, "data locality"),
    "f5902856": (f"{DDIA_2} · {TFAS}, ch 27-28", DDIA_2, "declarative vs imperative queries"),
    "262f7ca6": (f"{DDIA_2} · {TFAS}, ch 27-28", f"{TFAS}, ch 27-28", "endowment effect — ch 27"),
    "ee83afe9": (f"{DDIA_2} · {TFAS}, ch 27-28", f"{TFAS}, ch 27-28", "endowment effect — ch 27"),
    "031a148b": (f"{DDIA_2} · {TFAS}, ch 27-28", f"{TFAS}, ch 27-28", "negativity dominance — ch 28"),
    "cbdef1ec": (f"{DDIA_2} · {TFAS}, ch 27-28", f"{TFAS}, ch 27-28", "goals as reference points — ch 28"),

    # 2026-08-17 — a d-wealth note again credited to the reading sitting.
    "c7a64ecc": (f"{TFAS}, ch 29-30", WEALTH, "interest vs APR — d-wealth"),
    "dd481d82": (f"{TFAS}, ch 29-30", WEALTH, "compounding — d-wealth"),
    "714d0a87": (f"{TFAS}, ch 29-30", WEALTH, "emergency fund — d-wealth"),
    "00cd55c4": (f"{TFAS}, ch 29-30", WEALTH, "stock dividends — d-wealth"),
    "21600c3c": (f"{TFAS}, ch 29-30", None, "fourfold pattern — TFAS ch 29"),
    "ad9b9dd3": (f"{TFAS}, ch 29-30", None, "lotteries and insurance — TFAS ch 29"),
    "96d16ca3": (f"{TFAS}, ch 29-30", None, "rare events — TFAS ch 30"),
}


def _plan(conn: sqlite3.Connection) -> tuple[list[tuple], list[str]]:
    """The moves to make, and the rows that didn't line up. A prefix matching no row
    — or more than one — is reported rather than acted on."""
    moves, skipped = [], []
    for prefix, (expect, want, why) in MAPPING.items():
        rows = conn.execute(
            "select id, source_label, substr(cue, 1, 60) from highlights where id like ?",
            (prefix + "%",),
        ).fetchall()
        if len(rows) != 1:
            skipped.append(f"{prefix}: matched {len(rows)} rows, expected 1")
            continue
        row_id, current, cue = rows[0]
        if want is None:
            continue  # checked and correct as it stands
        if current != expect:
            skipped.append(f"{prefix}: carries {current!r}, expected {expect!r}")
            continue
        moves.append((row_id, current, want, cue, why))
    return moves, skipped


def main() -> int:
    write = "--write" in sys.argv
    db = _db_path()
    conn = sqlite3.connect(f"file:{db}?mode=ro" if not write else str(db), uri=not write)
    moves, skipped = _plan(conn)

    unchanged = sum(1 for _, (_, want, _) in MAPPING.items() if want is None)
    print(f"{db}\n{len(moves)} to re-label, {unchanged} checked and already correct, "
          f"{len(skipped)} skipped\n")
    for _, current, want, cue, why in moves:
        print(f"  {cue.strip()}\n    {current}\n    → {want}   ({why})\n")
    for note in skipped:
        print(f"  SKIPPED {note}")

    if not write:
        print("\nDry run — nothing written. Re-run with --write to apply.")
        return 0
    if skipped:
        print("\nRefusing to write: the data has moved since this mapping was checked.")
        return 1

    conn.close()
    from backup_db import main as snapshot  # a consistent copy before any change
    snapshot()
    conn = sqlite3.connect(str(db))
    with conn:
        conn.executemany(
            "update highlights set source_label = ? where id = ?",
            [(want, row_id) for row_id, _, want, _, _ in moves],
        )
    print(f"\nRe-labelled {len(moves)} highlights.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
