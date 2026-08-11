"""Shared test fixtures.

Every app import must see a throwaway database, so we set ARISE_DATABASE_URL
BEFORE importing anything from `app` — the engine is created at import time.
"""

import os
import tempfile
from pathlib import Path

import pytest

_TMP_DB = Path(tempfile.gettempdir()) / "arise-pytest.db"
os.environ["ARISE_DATABASE_URL"] = f"sqlite:///{_TMP_DB}"
# Keep the LLM off during tests regardless of the developer's shell env, so the
# fallback paths are what's exercised.
os.environ.pop("ARISE_LLM_API_KEY", None)
os.environ.pop("GEMINI_API_KEY", None)
# Same for the transcript service — tests stub it explicitly where needed.
os.environ.pop("ARISE_SUPADATA_API_KEY", None)
# And the digest mailer, so no test can ever send a real email.
os.environ.pop("ARISE_RESEND_API_KEY", None)
os.environ.pop("ARISE_DIGEST_TO", None)
os.environ.pop("ARISE_DIGEST_FROM", None)

from fastapi.testclient import TestClient  # noqa: E402
from app import models  # noqa: E402,F401  (registers tables on Base)
from app.db import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import seed_quests  # noqa: E402

DAY = "2026-07-18"


def _reset_schema() -> None:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)


@pytest.fixture
def client():
    """A TestClient on a freshly-seeded database (lifespan seeds the quests)."""
    Base.metadata.drop_all(engine)
    with TestClient(app) as c:  # startup runs create_all + ensure_schema + seed
        yield c
    Base.metadata.drop_all(engine)


@pytest.fixture
def db():
    """A bare session on a fresh, seeded database — for service-level tests."""
    _reset_schema()
    session = SessionLocal()
    seed_quests(session)
    try:
        yield session
    finally:
        session.close()
        Base.metadata.drop_all(engine)
