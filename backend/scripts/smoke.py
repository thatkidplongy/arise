#!/usr/bin/env python3
"""A quick liveness smoke test against a running server.

Read-only: it hits /health and /state and sanity-checks the payload shape.
It never writes, so it's safe to run against the live backend.

Usage:  python scripts/smoke.py [base_url] [token]
        python scripts/smoke.py http://localhost:8000
"""

import json
import sys
import urllib.request
from datetime import date


def _get(base: str, path: str, token: str) -> dict:
    req = urllib.request.Request(base + path)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r)


def main() -> int:
    base = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
    token = sys.argv[2] if len(sys.argv) > 2 else ""

    health = _get(base, "/health", token)
    assert health.get("status") == "ok", health
    print(f"[smoke] health ok ({base})")

    state = _get(base, f"/state?day={date.today().isoformat()}", token)
    for key in ("player", "stats", "quests", "preferences", "today"):
        assert key in state, f"missing '{key}' in /state"
    assert len(state["quests"]) > 0, "no quests returned"
    q = state["quests"][0]
    assert {"id", "title", "steps", "steps_done"} <= q.keys(), q.keys()

    print(
        f"[smoke] state ok — {state['player']['name']} · "
        f"L{state['player']['level']} · {len(state['quests'])} quests"
    )
    print("[smoke] PASS")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as e:  # noqa: BLE001 — smoke script: any failure is a fail
        print(f"[smoke] FAIL: {e}")
        sys.exit(1)
