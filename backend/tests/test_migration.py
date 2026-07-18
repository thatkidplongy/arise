"""The additive schema migration must add new columns without losing data."""

from sqlalchemy import inspect, text

from app.db import Base, engine, ensure_schema


def test_ensure_schema_adds_north_star_and_keeps_rows():
    Base.metadata.drop_all(engine)
    # An "old" players table, before north_star existed, with real data.
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE TABLE players (id VARCHAR PRIMARY KEY, name VARCHAR, "
                "equipped_title VARCHAR, created_at DATETIME)"
            )
        )
        conn.execute(text("INSERT INTO players (id, name) VALUES ('p1', 'Old Hunter')"))

    ensure_schema()

    cols = {c["name"] for c in inspect(engine).get_columns("players")}
    assert {"north_star", "current_book", "books_finished", "book_started_week"} <= cols
    with engine.begin() as conn:
        assert conn.execute(text("SELECT name FROM players WHERE id='p1'")).scalar() == "Old Hunter"

    Base.metadata.drop_all(engine)
