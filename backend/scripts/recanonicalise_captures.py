#!/usr/bin/env python3
"""Re-key stored captures under the corrected clean_url.

clean_url used to return whatever its pattern matched, so an optional `(?:www\\.)?`
left the www. on when it was there — and since that string is the dedup key
(insights.capture matches on source_url), www.tiktok.com/@x/video/1 and
tiktok.com/@x/video/1 were two different videos. It rebuilds the URL now, so the
same paste keys the same way whichever host it came from.

Rows written under the old rule keep their old key, which would let exactly the
thing the fix prevents happen once more: re-paste a link stored as www., and it
canonicalises to the bare host, misses the stored row, and is kept twice. This
walks both tables and writes each row's key the way clean_url would write it now.

A collision means the same video really is already kept twice under two spellings
— one row from before the fix, one from after. The older row wins (it has the
longer history behind it) and the newer is dropped, which is what capture would
have done had the keys agreed at the time.

Dry run:  python scripts/recanonicalise_captures.py
Apply:    python scripts/recanonicalise_captures.py --write

No network and no model calls — it only rewrites a column.
"""

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from app import transcript  # noqa: E402
from app.db import SessionLocal  # noqa: E402
from app.models import CaptureFailure, Insight  # noqa: E402

TABLES = (("insights", Insight), ("capture failures", CaptureFailure))


def main() -> int:
    write = "--write" in sys.argv
    db = SessionLocal()
    moved = dropped = 0
    try:
        for label, model in TABLES:
            rows = db.query(model).order_by(model.created_at).all()
            # (player, kind, key) → the first row to claim it, which is the oldest.
            claimed: dict[tuple, object] = {}
            print(f"\n{label}: {len(rows)} row(s)")
            for row in rows:
                new = transcript.clean_url(row.source_url)
                slot = (row.player_id, row.kind, new)
                holder = claimed.get(slot)
                if holder is not None:
                    dropped += 1
                    print(f"  DUPLICATE  {row.source_url}")
                    print(
                        f"             already kept as {holder.source_url} — dropping the newer row"
                    )
                    if write:
                        db.delete(row)
                    continue
                claimed[slot] = row
                if new != row.source_url:
                    moved += 1
                    print(f"  RE-KEY     {row.source_url}")
                    print(f"             → {new}")
                    if write:
                        row.source_url = new
        if write:
            db.commit()
    finally:
        db.close()

    print(f"\n{moved} re-keyed, {dropped} dropped as duplicates.")
    if not write:
        print("Dry run — nothing written. Re-run with --write to apply.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
