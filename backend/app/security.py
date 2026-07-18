"""API authentication.

The server is a single-player System, but once it's on the public internet
anyone with the URL could complete quests, rename the hunter, or wipe progress.
A shared bearer token gates every endpoint except /health.

Set ARISE_API_TOKEN in the server's environment to enable auth. Left unset
(local development), auth is disabled so the dev loop stays frictionless.
"""

import os
import secrets

from fastapi import Header, HTTPException

API_TOKEN = os.environ.get("ARISE_API_TOKEN", "")


def verify_token(authorization: str | None = Header(default=None)) -> None:
    if not API_TOKEN:
        return  # auth disabled (local dev)

    expected = f"Bearer {API_TOKEN}"
    # constant-time compare so a wrong token can't be guessed by timing.
    if authorization is None or not secrets.compare_digest(authorization, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing API token")
