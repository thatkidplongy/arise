#!/usr/bin/env python3
"""Take a consistent snapshot of the Arise database.

Uses SQLite's online-backup API, so it's safe to run while the backend is live
(WAL and in-flight writes are handled correctly). Keeps one snapshot per day and
prunes to the most recent KEEP days. Pure stdlib — no dependencies.

Run manually:   python scripts/backup_db.py
Scheduled:      loaded as a launchd job (see deploy/com.arise.backup.plist).
"""

import os
import sqlite3
import sys
from datetime import date
from pathlib import Path

KEEP = 30  # daily snapshots to retain

BACKEND_DIR = Path(__file__).resolve().parent.parent


def _db_path() -> Path:
    """The live database file — honour ARISE_DATABASE_URL, else backend/arise.db."""
    url = os.environ.get("ARISE_DATABASE_URL", "")
    if url.startswith("sqlite:///"):
        raw = url[len("sqlite:///") :]
        p = Path(raw)
        return p if p.is_absolute() else (BACKEND_DIR / raw).resolve()
    return BACKEND_DIR / "arise.db"


def main() -> int:
    src = _db_path()
    if not src.exists():
        print(f"[backup] no database at {src}; nothing to do")
        return 0

    backups = BACKEND_DIR / "backups"
    backups.mkdir(exist_ok=True)
    dest = backups / f"arise-{date.today().isoformat()}.db"

    with sqlite3.connect(src) as source, sqlite3.connect(dest) as target:
        source.backup(target)  # atomic, consistent copy

    # Prune to the most recent KEEP snapshots.
    snapshots = sorted(backups.glob("arise-*.db"))
    for old in snapshots[:-KEEP]:
        old.unlink(missing_ok=True)

    kept = len(list(backups.glob("arise-*.db")))
    print(f"[backup] wrote {dest.name} ({dest.stat().st_size} bytes); {kept} snapshot(s) kept")
    return 0


if __name__ == "__main__":
    sys.exit(main())
