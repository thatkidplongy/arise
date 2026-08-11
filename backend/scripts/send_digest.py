#!/usr/bin/env python3
"""Send yesterday's Recall digest by asking the running backend to do it.

Deliberately thin: the backend is always on and owns all state, so this posts to
its own API rather than opening a second connection to the database. That keeps
the Gemini and Resend keys in the one process that already loads them, and keeps
this script pure stdlib — no dependencies, like backup_db.py.

The day is server-local (yesterday on this Mac). Every user-facing route takes a
client-local day from the phone, but a scheduled job has no client to ask; for a
single-user app on one machine those are the same thing.

Sending is idempotent per day, so an extra run is harmless.

Run manually:   python scripts/send_digest.py [YYYY-MM-DD]
Scheduled:      loaded as a launchd job (see deploy/com.arise.digest.plist).
"""

import json
import os
import sys
import urllib.error
import urllib.request
from datetime import date, timedelta


def _base_url() -> str:
    return os.environ.get("ARISE_BASE_URL", "http://localhost:8000").rstrip("/")


def _day() -> str:
    if len(sys.argv) > 1:
        return date.fromisoformat(sys.argv[1]).isoformat()  # raises on a bad date
    return (date.today() - timedelta(days=1)).isoformat()


def main() -> int:
    day = _day()
    headers = {"content-type": "application/json"}
    token = os.environ.get("ARISE_API_TOKEN", "")
    if token:
        headers["authorization"] = f"Bearer {token}"

    req = urllib.request.Request(
        f"{_base_url()}/digest/send?day={day}", data=b"", headers=headers, method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out = json.load(resp)
    except urllib.error.HTTPError as e:
        # 503 is the expected "not configured yet" case, not a failure worth alarm.
        print(f"[digest] {day}: HTTP {e.code} — {e.read().decode(errors='replace')[:200]}")
        return 0 if e.code == 503 else 1
    except OSError as e:
        print(f"[digest] {day}: could not reach the backend — {type(e).__name__}")
        return 1

    print(f"[digest] {day}: {out.get('status')} "
          f"({out.get('highlight_count', 0)} highlight(s)) {out.get('detail', '')}".rstrip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
