"""The day's record that rides in the morning email: what each surface contributes,
and how it's worded. No network, no email."""

from datetime import datetime, timedelta, timezone

from app import recap, state
from app.models import (
    Completion,
    FoodEntry,
    GeneratedQuest,
    GroceryItem,
    Insight,
    JournalEntry,
    Learning,
    MoneyEntry,
    ReadingLog,
    Reminder,
)

DAY = "2026-07-18"


def _labels(rows: list[dict]) -> list[str]:
    return [r["label"] for r in rows]


def _local_noon(day: str) -> datetime:
    """Midday on `day` in the server's own timezone — a timestamp that lands on that
    calendar date no matter which zone the tests run in."""
    return datetime.fromisoformat(f"{day}T12:00:00").astimezone()


# ── of(): what each surface contributes ───────────────────────────────────────


def test_quests_are_counted_and_markers_kept_apart(db):
    player = state.get_or_create_player(db)
    db.add_all([
        Completion(player_id=player.id, quest_id="d-train", xp=10, day=DAY),
        Completion(player_id=player.id, quest_id="d-read", xp=10, day=DAY),
        Completion(player_id=player.id, quest_id="daily-clear", xp=15, day=DAY),
        Completion(player_id=player.id, quest_id="rest-day", xp=0, day=DAY),
    ])
    db.commit()

    r = recap.of(db, player, DAY)
    assert len(r["quests"]) == 2  # the two markers aren't quests
    assert r["cleared"] is True and r["rested"] is True
    assert r["xp"] == 35  # the bonus still counts toward the day's XP


def test_a_quest_shows_the_title_it_actually_displayed(db):
    """The card said "Mind Map", not the slot's generic name, so the recap should
    too — otherwise the email names something the hunter never saw."""
    player = state.get_or_create_player(db)
    db.add(Completion(player_id=player.id, quest_id="d-read", xp=10, day=DAY))
    db.add(GeneratedQuest(
        player_id=player.id, quest_id="d-read", period_key=DAY,
        title="Mind Map", desc="Connect an idea", steps="[]", resource="",
    ))
    db.commit()

    assert recap.of(db, player, DAY)["quests"][0]["title"] == "Mind Map"


def test_with_no_llm_content_it_still_uses_the_title_the_card_showed(db):
    """No generated row means the card fell back to the handcrafted pool variant for
    that day — so must the recap, not the slot's own generic name."""
    player = state.get_or_create_player(db)
    db.add(Completion(player_id=player.id, quest_id="d-read", xp=10, day=DAY))
    db.commit()

    shown = state.displayed_titles(db, player, DAY)["d-read"]
    assert recap.of(db, player, DAY)["quests"][0]["title"] == shown
    assert shown != "Grimoire Study"  # the slot name is never what the card displays


def test_money_splits_in_from_out(db):
    player = state.get_or_create_player(db)
    db.add_all([
        MoneyEntry(player_id=player.id, amount=1200, direction="out", note="Groceries",
                   day=DAY, bucket="needs"),
        MoneyEntry(player_id=player.id, amount=300.50, direction="out", note="Coffee",
                   day=DAY, bucket="wants"),
        MoneyEntry(player_id=player.id, amount=5000, direction="in", note="Payout", day=DAY),
    ])
    db.commit()

    money = recap.of(db, player, DAY)["money"]
    assert money["out"] == 1500.5 and money["in"] == 5000
    assert [m["note"] for m in money["lines"]] == ["Groceries", "Coffee", "Payout"]


def test_todos_are_matched_on_the_day_they_were_finished(db):
    """A to-do written last week and ticked yesterday belongs to yesterday."""
    player = state.get_or_create_player(db)
    db.add_all([
        Reminder(player_id=player.id, text="Go to pag-ibig", done=True, done_at=_local_noon(DAY)),
        Reminder(player_id=player.id, text="Done another day", done=True,
                 done_at=_local_noon("2026-07-17")),
        Reminder(player_id=player.id, text="Still open", done=False),
    ])
    db.commit()

    assert recap.of(db, player, DAY)["todos"] == ["Go to pag-ibig"]


def test_a_utc_timestamp_lands_on_the_local_day(db):
    """Timestamps are stored in UTC. Ticked at 8am local in a +8 zone, that's the
    previous UTC date — and it must still count as today."""
    player = state.get_or_create_player(db)
    local_8am = datetime.fromisoformat(f"{DAY}T08:00:00").astimezone()
    db.add(Reminder(player_id=player.id, text="Early one", done=True,
                    done_at=local_8am.astimezone(timezone.utc)))
    db.commit()

    assert recap.of(db, player, DAY)["todos"] == ["Early one"]


def test_the_rest_of_the_surfaces_are_gathered(db):
    player = state.get_or_create_player(db)
    db.add_all([
        ReadingLog(player_id=player.id, day=DAY, book="Thinking, Fast and Slow",
                   chapters=2, label="21-22"),
        FoodEntry(player_id=player.id, day=DAY, name="Adobo", kcal=650, protein_g=40),
        FoodEntry(player_id=player.id, day=DAY, name="Rice", kcal=200, protein_g=4),
        GroceryItem(player_id=player.id, name="Oats", bought=True, bought_at=_local_noon(DAY)),
        JournalEntry(player_id=player.id, day=DAY, text="A good day."),
        Learning(player_id=player.id, day=DAY, kind="book", source="A book"),
        Insight(player_id=player.id, kind="motivation", title="@someone",
                source_url="https://example.com/reel/1", created_at=_local_noon(DAY)),
    ])
    db.commit()

    r = recap.of(db, player, DAY)
    assert r["reading"] == {"chapters": ["21-22"], "count": 2, "book": "Thinking, Fast and Slow"}
    assert r["food"] == {"kcal": 850, "protein_g": 44, "items": 2}
    assert r["groceries"] == ["Oats"] and r["journal"] == 1 and r["learnings"] == 1
    assert r["captures"] == ["@someone"]


def test_an_empty_day_gathers_nothing(db):
    player = state.get_or_create_player(db)
    r = recap.of(db, player, DAY)
    assert recap.had_anything(r) is False
    assert recap.lines(r) == []


def test_empty_matches_the_shape_of_a_real_gather(db):
    """The email renders from either, so a missing key would only show up at 7am."""
    player = state.get_or_create_player(db)
    assert set(recap.empty(DAY)) == set(recap.of(db, player, DAY))


# ── lines(): the wording (pure) ───────────────────────────────────────────────


def test_lines_reads_as_a_record_of_the_day(db):
    player = state.get_or_create_player(db)
    db.add_all([
        Completion(player_id=player.id, quest_id="d-train", xp=10, day=DAY),
        Completion(player_id=player.id, quest_id="daily-clear", xp=15, day=DAY),
        MoneyEntry(player_id=player.id, amount=1200, direction="out", note="Groceries", day=DAY),
        Reminder(player_id=player.id, text="Go to pag-ibig", done=True, done_at=_local_noon(DAY)),
        ReadingLog(player_id=player.id, day=DAY, book="A Book", chapters=2, label="21-22"),
    ])
    db.commit()

    labels = _labels(recap.lines(recap.of(db, player, DAY)))
    assert "1 quest finished" in labels
    assert "Cleared every daily" in labels
    assert "1 to-do done" in labels
    assert "Read ch 21-22" in labels
    assert "₱1,200 out" in labels


def test_lines_leaves_out_surfaces_with_nothing_on_them():
    r = recap.empty(DAY)
    r["quests"] = [{"title": "Plyo Burst", "xp": 10}]
    labels = _labels(recap.lines(r))
    assert labels == ["1 quest finished"]  # no zero rows for money, food, skincare…


def test_lines_pluralises_rather_than_reading_like_a_robot():
    r = recap.empty(DAY)
    r["quests"] = [{"title": "A", "xp": 1}, {"title": "B", "xp": 1}]
    r["todos"] = ["one", "two"]
    labels = _labels(recap.lines(r))
    assert "2 quests finished" in labels and "2 to-dos done" in labels


def test_a_long_list_is_trimmed_and_says_how_much_it_hid():
    r = recap.empty(DAY)
    r["quests"] = [{"title": f"Quest {i}", "xp": 1} for i in range(7)]
    detail = recap.lines(r)[0]["detail"]
    assert detail.endswith("+ 3 more") and detail.count("·") == 3


def test_reading_without_chapter_names_still_gets_a_line():
    r = recap.empty(DAY)
    r["reading"] = {"chapters": [], "count": 3, "book": "A Book"}
    assert _labels(recap.lines(r)) == ["Read 3 chapters"]


def test_peso_drops_centavos_unless_there_are_any():
    assert recap.peso(1200) == "₱1,200"
    assert recap.peso(1500.5) == "₱1,500.50"
    assert recap.peso(0) == "₱0"
