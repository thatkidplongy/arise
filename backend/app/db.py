import os

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

# Swap this for a Postgres URL when it's time to scale — nothing else changes.
DATABASE_URL = os.environ.get("ARISE_DATABASE_URL", "sqlite:///./arise.db")

IS_SQLITE = DATABASE_URL.startswith("sqlite")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
)


if IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_conn, _record):
        """Durability + concurrency settings applied to every SQLite connection.

        WAL survives a mid-write power loss far better than the default rollback
        journal; busy_timeout lets a live backup read without tripping the app;
        foreign_keys enforces our relationships."""
        cur = dbapi_conn.cursor()
        cur.execute("PRAGMA journal_mode=WAL")
        cur.execute("PRAGMA synchronous=NORMAL")
        cur.execute("PRAGMA busy_timeout=5000")
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    """FastAPI dependency: one database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# Columns added to existing tables after their first release. create_all() makes
# new tables but never alters existing ones, so we add missing columns by hand.
# Keep entries append-only; each is skipped if the column already exists.
_ADDED_COLUMNS: list[tuple[str, str, str]] = [
    ("players", "north_star", "VARCHAR DEFAULT ''"),
    ("players", "current_book", "VARCHAR DEFAULT ''"),
    ("players", "books_finished", "INTEGER DEFAULT 0"),
    ("players", "book_started_week", "VARCHAR DEFAULT ''"),
    ("players", "book_review_week", "VARCHAR DEFAULT ''"),
    ("preferences", "level", "VARCHAR DEFAULT ''"),
    ("players", "current_book_chapters", "INTEGER DEFAULT 0"),
    ("players", "progression_start_week", "VARCHAR DEFAULT ''"),
    ("players", "interview_mode", "BOOLEAN DEFAULT 0"),
    ("food_entries", "fibre_g", "INTEGER DEFAULT 0"),
    # Plates logged before provenance existed stay untagged rather than being
    # retro-labelled as hand-counted — '' reads as "unsaid", not as a claim.
    ("food_entries", "source", "VARCHAR DEFAULT ''"),
    ("body_profiles", "goal_weight_kg", "FLOAT DEFAULT 0"),
    ("players", "avatar", "VARCHAR DEFAULT ''"),
    ("body_profiles", "country", "VARCHAR DEFAULT ''"),
    ("reminders", "done", "BOOLEAN DEFAULT 0"),
    ("reminders", "done_at", "DATETIME"),
    ("players", "japanese_started_week", "VARCHAR DEFAULT ''"),
    # Where the Japanese plan stands, replacing the week clock that used to decide it.
    # Existing players start at the top of the hiragana chart rather than being
    # guessed at from how long ago they began — the deck on Learn is one sitting away
    # from telling them what they already know.
    ("players", "japanese_step", "INTEGER DEFAULT 0"),
    ("insights", "kind", "VARCHAR DEFAULT 'motivation'"),
    ("quest_notes", "prompt", "VARCHAR DEFAULT ''"),
    ("quest_notes", "step_index", "INTEGER"),
    ("insights", "steps", "VARCHAR DEFAULT '[]'"),
    ("players", "priorities", "VARCHAR DEFAULT '{}'"),
    ("journal_entries", "updated_at", "DATETIME"),
    ("players", "monthly_income", "FLOAT DEFAULT 0"),
    ("players", "budget_start_month", "VARCHAR DEFAULT ''"),
    # Nullable on purpose: entries logged before the budget existed stay untagged
    # rather than being retro-sorted into a bucket they never had.
    ("money_entries", "bucket", "VARCHAR"),
    ("money_entries", "commitment_id", "VARCHAR"),
    # Highlights distilled before recall became retrieval-based have no cue; they
    # simply aren't quizzed rather than being asked with a made-up question.
    ("highlights", "cue", "VARCHAR DEFAULT ''"),
    ("highlights", "hook", "VARCHAR DEFAULT ''"),
    # Leitner scheduling. Existing rows get due='' and are backfilled on first read
    # rather than all coming due at once.
    ("highlights", "box", "INTEGER DEFAULT 0"),
    ("highlights", "due", "VARCHAR DEFAULT ''"),
    # How many times a card has been met (digest send or grade). Existing rows start
    # at 0 — their history was never counted, and pretending otherwise would lie.
    ("highlights", "seen", "INTEGER DEFAULT 0"),
    ("players", "craft_started_week", "VARCHAR DEFAULT ''"),
    ("players", "craft_phase", "INTEGER DEFAULT 1"),
    ("players", "craft_phase_day", "VARCHAR DEFAULT ''"),
    ("players", "craft_review_week", "VARCHAR DEFAULT ''"),
    ("players", "craft_source", "VARCHAR DEFAULT ''"),
    # Pieces ticked off in the current phase. Existing rows start at 0: what was
    # logged before this column existed was sittings, which is not the same claim.
    ("players", "craft_piece", "INTEGER DEFAULT 0"),
    # Plates. Food logged before the hand-portion rewrite has no portions and keeps
    # its calorie figures — the weekly estimate reads whichever one a row carries,
    # so old days stay honest rather than being re-measured into hands they never had.
    ("food_entries", "slot", "VARCHAR DEFAULT ''"),
    ("food_entries", "place", "VARCHAR DEFAULT ''"),
    ("food_entries", "protein_p", "INTEGER DEFAULT 0"),
    ("food_entries", "veg_p", "INTEGER DEFAULT 0"),
    ("food_entries", "carb_p", "INTEGER DEFAULT 0"),
    ("food_entries", "extra_p", "INTEGER DEFAULT 0"),
    ("food_entries", "at_time", "VARCHAR DEFAULT ''"),
]


def ensure_schema() -> None:
    """Additively bring an existing database up to date. Safe to run every boot;
    never drops or rewrites data."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, column, ddl in _ADDED_COLUMNS:
            if table not in tables:
                continue  # create_all will build it fresh, with the column
            if column not in {c["name"] for c in insp.get_columns(table)}:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl}"))
