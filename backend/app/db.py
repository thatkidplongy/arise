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
    ("body_profiles", "goal_weight_kg", "FLOAT DEFAULT 0"),
    ("players", "avatar", "VARCHAR DEFAULT ''"),
    ("body_profiles", "country", "VARCHAR DEFAULT ''"),
    ("reminders", "done", "BOOLEAN DEFAULT 0"),
    ("reminders", "done_at", "DATETIME"),
    ("players", "japanese_started_week", "VARCHAR DEFAULT ''"),
    ("insights", "kind", "VARCHAR DEFAULT 'motivation'"),
    ("quest_notes", "prompt", "VARCHAR DEFAULT ''"),
    ("quest_notes", "step_index", "INTEGER"),
    ("insights", "steps", "VARCHAR DEFAULT '[]'"),
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
