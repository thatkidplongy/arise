"""The read model: turn stored completions into the state the app renders.

The completions table is the source of truth — XP, stat levels, streaks, ranks
and achievements are all *derived* here on read. Nothing in this module writes
to the database; mutations live in service.py. At personal scale these are a
handful of rows; when it grows, they become SQL queries with the same contract.
"""

import json

from sqlalchemy.orm import Session

from . import game, quests
from .achievements import ACHIEVEMENTS, Snapshot
from .models import AchievementUnlock, Completion, Player, Preference, QuestDef, StepCheck


def get_or_create_player(db: Session) -> Player:
    player = db.query(Player).first()
    if player is None:
        player = Player()
        db.add(player)
        db.commit()
        db.refresh(player)
    return player


# ── Row access ────────────────────────────────────────────────────────────────


def quest_defs(db: Session) -> list[QuestDef]:
    return db.query(QuestDef).filter_by(active=True).order_by(QuestDef.sort).all()


def completions_of(db: Session, player: Player) -> list[Completion]:
    return db.query(Completion).filter_by(player_id=player.id).all()


def _parse_focus(raw: str) -> list[str]:
    """The focus column holds a JSON list of tags. Tolerate a bare legacy string."""
    try:
        vals = json.loads(raw)
        if not isinstance(vals, list):
            vals = [str(vals)]
    except (ValueError, TypeError):
        vals = [raw] if raw else []
    return [v for v in (str(s).strip() for s in vals) if v]


def preferences_of(db: Session, player: Player) -> dict[str, list[str]]:
    out: dict[str, list[str]] = {}
    for p in db.query(Preference).filter_by(player_id=player.id):
        vals = _parse_focus(p.focus)
        if vals:
            out[p.stat] = vals
    return out


# ── Derivation ──────────────────────────────────────────────────────────────


def _count(rows: list[Completion], quest_id: str, day: str | None = None, week: str | None = None) -> int:
    n = 0
    for r in rows:
        if r.quest_id != quest_id:
            continue
        if day is not None and r.day != day:
            continue
        if week is not None and game.week_key(r.day) != week:
            continue
        n += 1
    return n


def done_count(rows: list[Completion], quest: QuestDef, day: str) -> int:
    if quest.cadence == "weekly":
        return _count(rows, quest.id, week=game.week_key(day))
    return _count(rows, quest.id, day=day)


def dailies_cleared(rows: list[Completion], defs: list[QuestDef], day: str) -> bool:
    dailies = [q for q in defs if q.cadence == "daily"]
    return all(_count(rows, q.id, day=day) >= q.target for q in dailies)


def has_bonus(rows: list[Completion], day: str) -> bool:
    return any(r.quest_id == game.DAILY_CLEAR_ID and r.day == day for r in rows)


def aggregate(rows: list[Completion], defs: list[QuestDef]) -> dict:
    def_by_id = {q.id: q for q in defs}
    by_stat = {k: 0 for k in game.STAT_KEYS}
    quest_counts: dict[str, int] = {}
    active_days: set[str] = set()
    bonus_days: set[str] = set()
    total_xp = total_completions = side_completions = 0

    for r in rows:
        total_xp += r.xp
        active_days.add(r.day)  # rest days count too — showing up includes resting
        quest_counts[r.quest_id] = quest_counts.get(r.quest_id, 0) + 1
        if r.quest_id == game.DAILY_CLEAR_ID:
            bonus_days.add(r.day)
            continue
        if r.quest_id == game.REST_DAY_ID:
            continue  # keeps the streak alive, but isn't a quest completion
        total_completions += 1
        quest = def_by_id.get(r.quest_id)
        if quest is not None:
            by_stat[quest.stat] = by_stat.get(quest.stat, 0) + r.xp
            if quest.cadence == "side":
                side_completions += 1

    return {
        "total_xp": total_xp,
        "by_stat": by_stat,
        "quest_counts": quest_counts,
        "active_days": active_days,
        "bonus_days": bonus_days,
        "total_completions": total_completions,
        "side_completions": side_completions,
    }


def snapshot(agg: dict) -> Snapshot:
    return Snapshot(
        total_xp=agg["total_xp"],
        level=game.level_info(agg["total_xp"])["level"],
        stat_levels={k: game.stat_level_info(v)["level"] for k, v in agg["by_stat"].items()},
        max_streak=game.max_streak(agg["active_days"]),
        daily_clears=len(agg["bonus_days"]),
        total_completions=agg["total_completions"],
        side_completions=agg["side_completions"],
        quest_counts=agg["quest_counts"],
    )


# ── State assembly ────────────────────────────────────────────────────────────


def _quest_out(q: QuestDef, day: str, rows, prefs, undoable_id, checks_by, book="") -> dict:
    title, desc, steps, resource = quests.content_for(q, day, prefs.get(q.stat), book)
    pk = quests.period_key(q.cadence, day)
    checked = checks_by.get((q.id, pk), set())
    return {
        "id": q.id,
        "title": title,
        "desc": desc,
        "resource": resource,
        "steps": steps,
        "steps_done": [i in checked for i in range(len(steps))],
        "stat": q.stat,
        "xp": q.xp,
        "cadence": q.cadence,
        "target": q.target,
        "done": done_count(rows, q, day),
        "undoable_id": undoable_id(q),
    }


def build_state(db: Session, player: Player, day: str) -> dict:
    defs = quest_defs(db)
    rows = completions_of(db, player)
    prefs = preferences_of(db, player)
    agg = aggregate(rows, defs)

    li = game.level_info(agg["total_xp"])
    best = game.max_streak(agg["active_days"])
    rank = game.rank_for(li["level"], best)

    dailies = [q for q in defs if q.cadence == "daily"]
    dailies_done = sum(1 for q in dailies if _count(rows, q.id, day=day) >= q.target)
    resting = any(r.quest_id == game.REST_DAY_ID and r.day == day for r in rows)

    # Reading review: once a new week has begun since the book was started, ask
    # (once that week) whether it's finished and what's next.
    week = game.week_key(day)
    review_pending = bool(
        player.current_book
        and player.book_started_week
        and week > player.book_started_week
        and player.book_review_week != week
    )

    checks_by: dict[tuple[str, str], set[int]] = {}
    for c in db.query(StepCheck).filter_by(player_id=player.id):
        checks_by.setdefault((c.quest_id, c.period_key), set()).add(c.step_index)

    def undoable_id(quest: QuestDef) -> str | None:
        todays = [r for r in rows if r.quest_id == quest.id and r.day == day]
        return max(todays, key=lambda r: r.at).id if todays else None

    unlocks = {
        u.achievement_id: u.unlocked_at
        for u in db.query(AchievementUnlock).filter_by(player_id=player.id)
    }

    return {
        "player": {
            "name": player.name,
            "equipped_title": player.equipped_title,
            "north_star": player.north_star,
            "created_at": player.created_at,
            "level": li["level"],
            "xp_into": li["into"],
            "xp_needed": li["needed"],
            "total_xp": agg["total_xp"],
            "rank": rank,
            "current_book": player.current_book,
            "books_finished": player.books_finished,
        },
        "book_review": {"pending": review_pending, "book": player.current_book},
        "stats": [
            {"key": k, **game.stat_level_info(agg["by_stat"][k])} for k in game.STAT_KEYS
        ],
        "streak": {"current": game.current_streak(agg["active_days"], day), "best": best},
        "today": {
            "day": day,
            "xp": sum(r.xp for r in rows if r.day == day),
            "dailies_done": dailies_done,
            "dailies_total": len(dailies),
            "cleared": dailies_done == len(dailies) and len(dailies) > 0,
            "resting": resting,
        },
        "next_rank": game.next_gate(li["level"], best),
        "preferences": prefs,
        "quests": [
            _quest_out(q, day, rows, prefs, undoable_id, checks_by, player.current_book)
            for q in defs
        ],
        "achievements": [
            {
                "id": a.id,
                "name": a.name,
                "desc": a.desc,
                "title_reward": a.title_reward,
                "unlocked_at": unlocks.get(a.id),
            }
            for a in ACHIEVEMENTS
        ],
        "record": {
            "active_days": len(agg["active_days"]),
            "total_completions": agg["total_completions"],
        },
    }
