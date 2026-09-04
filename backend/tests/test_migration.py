"""Bringing an existing database up to date: added columns, added tables, and the
one quest field the seed reconciles rather than leaves alone."""

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


def test_new_tables_appear_on_an_existing_database():
    """A table added after first release is built by create_all, not ensure_schema
    (which only ever adds columns). The failure ledger is one of those, so an
    existing arise.db grows it on the next boot rather than 500ing on first read."""
    Base.metadata.drop_all(engine)
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE players (id VARCHAR PRIMARY KEY, name VARCHAR)"))
        conn.execute(text("INSERT INTO players (id, name) VALUES ('p1', 'Old Hunter')"))

    # What app startup does, in order.
    Base.metadata.create_all(engine)
    ensure_schema()

    assert "capture_failures" in set(inspect(engine).get_table_names())
    with engine.begin() as conn:
        assert conn.execute(text("SELECT name FROM players WHERE id='p1'")).scalar() == "Old Hunter"

    Base.metadata.drop_all(engine)


def test_rescaled_quest_xp_reaches_a_database_that_was_already_seeded():
    """The seed is additive for rows, so a quest already in the database keeps its
    progress — but XP is pushed onto it. Without that, rescaling the tiers would only
    ever reach a fresh database and never the one actually being played."""
    from sqlalchemy.orm import Session

    from app.models import Completion, Player, QuestDef
    from app.seed import SEED_QUESTS, seed_quests

    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    seeded = next(q for q in SEED_QUESTS if q["cadence"] == "daily")

    with Session(engine) as db:
        # An "old" row at the pre-rescale value, with a completion already banked.
        db.add(Player(id="p1", name="Old Hunter"))
        db.flush()  # the completion below has a foreign key onto it
        db.add(QuestDef(id=seeded["id"], title="Old title", desc="", stat=seeded["stat"],
                        xp=10, cadence="daily", target=1, sort=0))
        db.add(Completion(player_id="p1", quest_id=seeded["id"], xp=10, day="2026-07-18"))
        db.commit()

        seed_quests(db)

        row = db.get(QuestDef, seeded["id"])
        assert row.xp == seeded["xp"] > 10  # the rescale lands
        assert row.title == "Old title"     # …and nothing else is overwritten
        # History keeps what it was awarded — a rescale is never retroactive.
        banked = db.query(Completion).filter_by(quest_id=seeded["id"]).one()
        assert banked.xp == 10

    Base.metadata.drop_all(engine)


def test_xp_tiers_are_ordered_daily_then_weekly_then_side():
    """The rule the numbers exist to express: a daily is worth the most, a side quest
    the least. One flat value per tier, so the board reads without arithmetic."""
    from app.game import DAILY_CLEAR_BONUS
    from app.seed import SEED_QUESTS

    by_cadence: dict[str, set[int]] = {}
    for q in SEED_QUESTS:
        by_cadence.setdefault(q["cadence"], set()).add(q["xp"])

    assert all(len(v) == 1 for v in by_cadence.values()), by_cadence  # flat within a tier
    daily, weekly, side = (by_cadence[c].pop() for c in ("daily", "weekly", "side"))
    assert daily > weekly > side
    # Clearing every area beats any single card on the board.
    assert DAILY_CLEAR_BONUS > daily
