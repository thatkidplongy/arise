"""What actually happened on a day — the recap the morning email carries.

The digest's job used to be memory alone (what you read, asked back the next
morning). This is the other half: a plain record of the day you just had, drawn
from every surface that stores one — quests, to-dos, money, reading, food,
groceries, skincare, journal, captures, achievements.

Two layers, kept apart on purpose:
  • `of()`      — reads the database and returns structured counts. One query per
                  surface, nothing derived twice.
  • `lines()`   — turns that into display-ready (label, detail) rows. Pure, so the
                  wording is testable and the text and HTML emails can't drift.

Timestamps: rows keyed by a `day` string are already the hunter's local day. Rows
keyed only by a timestamp (to-dos, groceries, captures, achievements) store UTC, so
they're converted to the server's own timezone first — this is a single-user app
running on the hunter's machine, so server-local *is* their local (the same
assumption `state.get_or_create_player` makes about `date.today()`).
"""

from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from . import game, reading as reading_lib
from .models import (
    AchievementUnlock,
    Completion,
    FoodEntry,
    GroceryItem,
    Insight,
    JournalEntry,
    Learning,
    MoneyEntry,
    Player,
    QuestDef,
    ReadingLog,
    Reminder,
    SkincareCheck,
    SkincareStep,
)
from .achievements import ACHIEVEMENTS


ACHIEVEMENTS_BY_ID: dict[str, str] = {a.id: a.name for a in ACHIEVEMENTS}


def _local_date(dt: datetime | None) -> date | None:
    """The hunter's calendar date for a stored timestamp. Naive rows are read as UTC
    (that's what `utcnow` wrote), then everything converts to server-local time."""
    if dt is None:
        return None
    aware = dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)
    return aware.astimezone().date()


def _on(dt: datetime | None, day: str) -> bool:
    d = _local_date(dt)
    return d is not None and d.isoformat() == day


def peso(amount: float) -> str:
    """Pesos the way the app shows them — no centavos unless there are any."""
    whole = round(amount, 2)
    if whole == int(whole):
        return f"₱{int(whole):,}"
    return f"₱{whole:,.2f}"


def _reading_recap(logs: list[ReadingLog]) -> dict:
    """What the day's reading adds up to, for the one book the line names.

    The first book read is the one named, and only its own sittings are counted with
    it. Lumping every log under that name is the same mistake as crediting a book with
    another source's highlights: it reads as one long sitting on a book you barely
    opened."""
    if not logs:
        return {"chapters": [], "count": 0, "book": ""}
    book = logs[0].book
    key = reading_lib.book_key(book or "")
    same = [r for r in logs if reading_lib.book_key(r.book or "") == key]
    return {
        "chapters": [r.label.strip() for r in same if r.label.strip()],
        "count": sum(r.chapters for r in same),
        "book": book,
    }


def _quest_titles(db: Session, player: Player, day: str) -> dict[str, str]:
    """Slot id → the title that slot showed on `day`, as the card showed it.

    `state` is imported here rather than at the top because it imports the digest,
    which imports this module — a module-level import would close that loop.

    Not wrapped in a try/except: this is the same resolver every /state call runs, so
    if it can raise here the app is already broken, and swallowing the error only
    turns a loud bug into an email that quietly names the wrong thing. (It did
    exactly that once — a missing local, hidden for a whole test run.)"""
    from . import state

    titles = {d.id: d.title for d in db.query(QuestDef).all()}
    titles.update(state.displayed_titles(db, player, day))
    return titles


def empty(day: str) -> dict:
    """A day with nothing on it — the shape `of()` returns, so callers (and any
    context built before the recap existed) can rely on the keys being there."""
    return {
        "day": day,
        "xp": 0,
        "quests": [],
        "cleared": False,
        "rested": False,
        "achievements": [],
        "todos": [],
        "money": {"in": 0.0, "out": 0.0, "lines": []},
        "reading": {"chapters": [], "count": 0, "book": ""},
        "food": {"kcal": 0, "protein_g": 0, "items": 0},
        "groceries": [],
        "skincare": {"done": 0, "total": 0},
        "journal": 0,
        "learnings": 0,
        "notion": [],
        "studied": [],
        "captures": [],
    }


def of(db: Session, player: Player, day: str) -> dict:
    """Everything the hunter did on `day`, counted from every surface that logs it."""
    titles = _quest_titles(db, player, day)

    quests: list[dict] = []
    cleared = rested = False
    xp = 0
    for row in db.query(Completion).filter_by(player_id=player.id, day=day).order_by(Completion.at):
        xp += row.xp
        if game.is_rest(row.quest_id):
            rested = True
        elif row.quest_id == game.DAILY_CLEAR_ID:
            cleared = True
        else:
            quests.append({"title": titles.get(row.quest_id, row.quest_id), "xp": row.xp})

    money_in = money_out = 0.0
    money_lines: list[dict] = []
    for row in db.query(MoneyEntry).filter_by(player_id=player.id, day=day).order_by(MoneyEntry.created_at):
        if row.direction == "in":
            money_in += row.amount
        else:
            money_out += row.amount
        money_lines.append({
            "note": (row.note or "").strip(),
            "amount": row.amount,
            "direction": row.direction,
            "bucket": row.bucket or "",
        })

    food = db.query(FoodEntry).filter_by(player_id=player.id, day=day).all()
    reading = db.query(ReadingLog).filter_by(player_id=player.id, day=day).order_by(ReadingLog.created_at).all()

    skincare_total = db.query(SkincareStep).filter_by(player_id=player.id).count()
    skincare_done = db.query(SkincareCheck).filter_by(player_id=player.id, day=day).count()

    return {
        "day": day,
        "xp": xp,
        "quests": quests,
        "cleared": cleared,
        "rested": rested,
        "achievements": [
            ACHIEVEMENTS_BY_ID.get(u.achievement_id, u.achievement_id)
            for u in db.query(AchievementUnlock).filter_by(player_id=player.id)
            if _on(u.unlocked_at, day)
        ],
        "todos": [
            r.text.strip()
            for r in db.query(Reminder).filter_by(player_id=player.id, done=True)
            if _on(r.done_at, day)
        ],
        "money": {"in": money_in, "out": money_out, "lines": money_lines},
        # Named after one book, so the chapters and the count have to be that book's.
        # A day with two books would otherwise read as one long sitting on the first.
        "reading": _reading_recap(reading),
        "food": {
            "kcal": sum(f.kcal for f in food),
            "protein_g": sum(f.protein_g for f in food),
            "items": len(food),
        },
        "groceries": [
            g.name.strip()
            for g in db.query(GroceryItem).filter_by(player_id=player.id, bought=True)
            if _on(g.bought_at, day)
        ],
        "skincare": {"done": skincare_done, "total": skincare_total},
        "journal": db.query(JournalEntry).filter_by(player_id=player.id, day=day).count(),
        "learnings": db.query(Learning).filter_by(player_id=player.id, day=day).count(),
        # What was read outside the current book, named. Notion first, since the
        # system-design plan runs on it; everything else logged in Learn follows.
        "notion": [
            (r.source or "a Notion page").strip()
            for r in db.query(Learning)
            .filter_by(player_id=player.id, day=day, kind="notion")
            .order_by(Learning.created_at)
        ],
        "studied": [
            f"{(r.source or r.kind).strip()}"
            for r in db.query(Learning)
            .filter_by(player_id=player.id, day=day)
            .order_by(Learning.created_at)
            if r.kind not in ("notion", "book")
        ],
        "captures": [
            (i.title or i.kind).strip()
            for i in db.query(Insight).filter_by(player_id=player.id)
            if _on(i.created_at, day)
        ],
    }


def _join(names: list[str], cap: int = 4) -> str:
    """Names as one line, trimmed so a long list can't run off the page. The count
    of what's hidden is shown rather than dropped silently."""
    kept = [n for n in names if n][:cap]
    rest = len([n for n in names if n]) - len(kept)
    line = " · ".join(kept)
    return f"{line} + {rest} more" if rest > 0 else line


def _plural(n: int, one: str, many: str | None = None) -> str:
    return one if n == 1 else (many or f"{one}s")


def _money_line(money: dict) -> str:
    parts = []
    if money["out"]:
        parts.append(f"{peso(money['out'])} out")
    if money["in"]:
        parts.append(f"{peso(money['in'])} in")
    return " · ".join(parts)


def lines(recap: dict) -> list[dict]:
    """The recap as display-ready rows: a bold `label` and a quieter `detail`.

    Pure, and ordered the way the day is lived rather than by how the database is
    laid out: what you finished, then what you spent and read, then the upkeep.
    Surfaces with nothing on them are left out entirely — an empty row reads as a
    reproach, and the point of this is a record, not a scorecard."""
    out: list[dict] = []

    quests = recap["quests"]
    if quests:
        out.append({
            "label": f"{len(quests)} {_plural(len(quests), 'quest')} finished",
            "detail": _join([q["title"] for q in quests]),
        })
    if recap["cleared"]:
        out.append({"label": "Cleared every daily", "detail": "the full-day bonus landed"})
    if recap["rested"]:
        out.append({"label": "Took a rest day", "detail": "streak intact — rest counts"})
    for name in recap["achievements"]:
        out.append({"label": f"Achievement · {name}", "detail": ""})

    todos = recap["todos"]
    if todos:
        out.append({
            "label": f"{len(todos)} to-{_plural(len(todos), 'do')} done",
            "detail": _join(todos),
        })

    reading = recap["reading"]
    if reading["count"]:
        chapters = _join(reading["chapters"], cap=6)
        label = f"Read ch {chapters}" if chapters else f"Read {reading['count']} {_plural(reading['count'], 'chapter')}"
        out.append({"label": label, "detail": reading["book"]})

    notion = recap["notion"]
    if notion:
        out.append({
            "label": f"Read in Notion · {len(notion)} {_plural(len(notion), 'page')}",
            "detail": _join(notion, cap=3),
        })

    studied = recap["studied"]
    if studied:
        out.append({
            "label": f"Also learned from {len(studied)} {_plural(len(studied), 'source')}",
            "detail": _join(studied, cap=3),
        })

    money = recap["money"]
    if money["lines"]:
        out.append({
            "label": _money_line(money),
            "detail": _join([m["note"] for m in money["lines"] if m["note"]]),
        })

    food = recap["food"]
    if food["items"]:
        out.append({
            "label": f"{food['kcal']:,} kcal · {food['protein_g']}g protein",
            "detail": f"{food['items']} {_plural(food['items'], 'item')} logged",
        })

    groceries = recap["groceries"]
    if groceries:
        out.append({
            "label": f"{len(groceries)} {_plural(len(groceries), 'grocery', 'groceries')} bought",
            "detail": _join(groceries),
        })

    skin = recap["skincare"]
    if skin["done"]:
        out.append({
            "label": f"Skincare · {skin['done']} of {skin['total']} steps",
            "detail": "",
        })

    if recap["journal"]:
        n = recap["journal"]
        out.append({"label": f"{n} journal {_plural(n, 'entry', 'entries')}", "detail": ""})

    if recap["captures"]:
        out.append({
            "label": f"Captured {len(recap['captures'])} {_plural(len(recap['captures']), 'video')}",
            "detail": _join(recap["captures"]),
        })

    return out


def had_anything(recap: dict) -> bool:
    """Whether the day has a record worth printing at all — the email's empty state
    keys off this, so a day of quests with no reading still gets its recap."""
    return bool(lines(recap))
