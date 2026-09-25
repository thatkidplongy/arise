"""Shared test fixtures.

Every app import must see a throwaway database, so we set ARISE_DATABASE_URL
BEFORE importing anything from `app` — the engine is created at import time.
That rules out pytest's own tmp_path_factory, which doesn't exist until fixtures
run, so the scratch directory below is made by hand at import.
"""

import os
import shutil
import tempfile
from pathlib import Path

import pytest

# One scratch directory per pytest process, rather than one shared path.
#
# These were fixed names under the system temp dir, so two runs at once — a
# second terminal, a watch loop, an agent and a human — pointed at the same
# SQLite file. Each run's drop_all then tore down tables the other was mid-query
# on, and both collapsed into hundreds of "no such table" errors that look
# nothing like the change being tested and pass cleanly on a retry. (xdist isn't
# installed here; adding `-n` would have turned this from occasional to certain.)
#
# mkdtemp is unique by construction, so there's no PID arithmetic and nothing to
# collide. The database, whatever WAL sidecars SQLite puts beside it, and the
# budget tally all live in here and leave together (see pytest_sessionfinish).
_SCRATCH = Path(tempfile.mkdtemp(prefix="arise-pytest-"))

os.environ["ARISE_DATABASE_URL"] = f"sqlite:///{_SCRATCH / 'arise.db'}"
# The model budget's tally is written beside the database so a restart can pick it
# up; in tests it goes to a throwaway file the budget fixture below clears.
os.environ["ARISE_LLM_BUDGET_FILE"] = str(_SCRATCH / "llm-budget.json")


def pytest_sessionfinish(session, exitstatus):
    """Take the scratch directory with us.

    The old fixed-name database was left behind on every run and simply
    overwritten by the next one; one directory per run would pile up instead.
    Best-effort — a hard kill skips it, and the system temp dir is swept by the
    OS anyway."""
    shutil.rmtree(_SCRATCH, ignore_errors=True)
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


@pytest.fixture(autouse=True)
def _fresh_llm_budget():
    """The model budget is module state, so one test's spending would otherwise be
    another's ceiling."""
    from app import llm

    llm.reset_budget()
    yield
    llm.reset_budget()


@pytest.fixture
def craft_unparked(monkeypatch):
    """Craft is parked off the board for now (`state._PARKED`). The tests of how it
    behaves when it's dealt run with it back on, so they still hold the day it returns."""
    from app import state

    monkeypatch.setattr(state, "_PARKED", frozenset())


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
