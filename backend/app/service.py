"""Write operations — everything that changes the database.

Each public action commits and returns the freshly-rebuilt state (via
state.build_state), so a route is a thin wrapper: get the player, call one of
these, return the result. Reads and derivation live in state.py.
"""

import json

from fastapi import HTTPException
from sqlalchemy.orm import Session

from . import game, quests
from .achievements import ACHIEVEMENTS
from .models import AchievementUnlock, Completion, Player, Preference, QuestDef, StepCheck, utcnow
from .state import (
    aggregate,
    build_state,
    completions_of,
    dailies_cleared,
    done_count,
    has_bonus,
    preferences_of,
    quest_defs,
    snapshot,
)


# ── Completion mechanics (shared by the completion routes) ───────────────────


def _apply_completion(db: Session, player: Player, quest: QuestDef, day: str, rows, defs) -> list[dict]:
    """Record one completion for `quest` and return the System events it triggers
    (daily clear, level up, rank up, achievements). Mutates `rows`; does not commit.
    The caller is responsible for checking the target isn't already met."""
    before = aggregate(rows, defs)
    before_level = game.level_info(before["total_xp"])["level"]
    before_rank = game.rank_for(before_level, game.max_streak(before["active_days"]))

    completion = Completion(player_id=player.id, quest_id=quest.id, xp=quest.xp, day=day)
    db.add(completion)
    db.flush()
    rows.append(completion)
    events: list[dict] = []

    if quest.cadence == "daily" and dailies_cleared(rows, defs, day) and not has_bonus(rows, day):
        bonus = Completion(
            player_id=player.id, quest_id=game.DAILY_CLEAR_ID, xp=game.DAILY_CLEAR_BONUS, day=day
        )
        db.add(bonus)
        db.flush()
        rows.append(bonus)
        events.append({"type": "daily_clear", "data": {"bonus_xp": game.DAILY_CLEAR_BONUS}})

    after = aggregate(rows, defs)
    after_level = game.level_info(after["total_xp"])["level"]
    if after_level > before_level:
        events.append({"type": "level_up", "data": {"level": after_level}})

    after_rank = game.rank_for(after_level, game.max_streak(after["active_days"]))
    if after_rank != before_rank:
        events.append({"type": "rank_up", "data": {"from": before_rank, "to": after_rank}})

    unlocked = {u.achievement_id for u in db.query(AchievementUnlock).filter_by(player_id=player.id)}
    snap = snapshot(after)
    for a in ACHIEVEMENTS:
        if a.id not in unlocked and a.check(snap):
            db.add(AchievementUnlock(player_id=player.id, achievement_id=a.id))
            events.append(
                {
                    "type": "achievement",
                    "data": {"id": a.id, "name": a.name, "desc": a.desc, "title_reward": a.title_reward},
                }
            )
    return events


def _revoke_bonus_if_needed(db: Session, player: Player, day: str) -> None:
    """Drop the daily-clear bonus for a day whose dailies are no longer all done."""
    rows = completions_of(db, player)
    if has_bonus(rows, day) and not dailies_cleared(rows, quest_defs(db), day):
        for bonus in [r for r in rows if r.quest_id == game.DAILY_CLEAR_ID and r.day == day]:
            db.delete(bonus)


def _remove_one_completion(db: Session, player: Player, quest: QuestDef, day: str) -> bool:
    """Remove the most recent completion of `quest` in the period containing `day`."""
    rows = completions_of(db, player)
    if quest.cadence == "weekly":
        wk = game.week_key(day)
        candidates = [r for r in rows if r.quest_id == quest.id and game.week_key(r.day) == wk]
    else:
        candidates = [r for r in rows if r.quest_id == quest.id and r.day == day]
    if not candidates:
        return False
    row = max(candidates, key=lambda r: r.at)
    row_day = row.day
    db.delete(row)
    db.flush()
    _revoke_bonus_if_needed(db, player, row_day)
    return True


def _clear_step_checks(db: Session, player: Player, quest_id: str, period_key: str) -> None:
    db.query(StepCheck).filter_by(
        player_id=player.id, quest_id=quest_id, period_key=period_key
    ).delete()


# ── Public actions ────────────────────────────────────────────────────────────


def complete_quest(db: Session, player: Player, quest_id: str, day: str) -> dict:
    defs = quest_defs(db)
    quest = next((q for q in defs if q.id == quest_id), None)
    if quest is None:
        raise HTTPException(404, f"Unknown quest: {quest_id}")

    rows = completions_of(db, player)
    if done_count(rows, quest, day) >= quest.target:
        raise HTTPException(409, "Quest already complete for this period")

    events = _apply_completion(db, player, quest, day, rows, defs)
    db.commit()
    return {"events": events, "state": build_state(db, player, day)}


def undo_completion(db: Session, player: Player, completion_id: str, day: str) -> dict:
    row = db.get(Completion, completion_id)
    if row is None or row.player_id != player.id:
        raise HTTPException(404, "Completion not found")
    if row.quest_id == game.DAILY_CLEAR_ID:
        raise HTTPException(400, "The daily-clear bonus is revoked automatically")

    row_day = row.day
    quest_id = row.quest_id
    db.delete(row)
    db.flush()
    _revoke_bonus_if_needed(db, player, row_day)

    # Reset the quest's checklist for this period so it starts fresh.
    quest = next((q for q in quest_defs(db) if q.id == quest_id), None)
    if quest is not None:
        _clear_step_checks(db, player, quest_id, quests.period_key(quest.cadence, row_day))

    db.commit()
    return {"events": [], "state": build_state(db, player, day)}


def toggle_step(db: Session, player: Player, quest_id: str, step_index: int, day: str) -> dict:
    """Tick or untick a single step. Ticking the last step auto-completes the quest;
    unticking a step of a completed quest reverses that completion."""
    defs = quest_defs(db)
    quest = next((q for q in defs if q.id == quest_id), None)
    if quest is None:
        raise HTTPException(404, f"Unknown quest: {quest_id}")
    if quest.target != 1:
        raise HTTPException(400, "Step checklist only applies to single-completion quests")

    prefs = preferences_of(db, player)
    _, _, steps, _ = quests.content_for(quest, day, prefs.get(quest.stat), player.current_book)
    if not steps or not (0 <= step_index < len(steps)):
        raise HTTPException(400, "No such step for this quest today")

    pk = quests.period_key(quest.cadence, day)
    key = {"player_id": player.id, "quest_id": quest.id, "period_key": pk, "step_index": step_index}
    existing = db.get(StepCheck, key)
    rows = completions_of(db, player)
    is_done = done_count(rows, quest, day) >= quest.target

    events: list[dict] = []
    completed = False

    if existing is not None:
        db.delete(existing)
        db.flush()
        if is_done:
            _remove_one_completion(db, player, quest, day)
    else:
        db.add(StepCheck(**key))
        db.flush()
        n_checked = (
            db.query(StepCheck)
            .filter_by(player_id=player.id, quest_id=quest.id, period_key=pk)
            .count()
        )
        if n_checked >= len(steps) and not is_done:
            events = _apply_completion(db, player, quest, day, rows, defs)
            completed = True

    db.commit()
    return {"events": events, "state": build_state(db, player, day), "completed": completed}


def toggle_rest_day(db: Session, player: Player, day: str) -> None:
    """Turn today's intentional rest day on or off. A rest day keeps the streak
    alive without pretending you did a quest."""
    existing = [
        r for r in completions_of(db, player) if r.quest_id == game.REST_DAY_ID and r.day == day
    ]
    if existing:
        for r in existing:
            db.delete(r)
    else:
        db.add(Completion(player_id=player.id, quest_id=game.REST_DAY_ID, xp=0, day=day))
    db.commit()


def update_player(
    db: Session,
    player: Player,
    name: str | None,
    title_provided: bool,
    equipped_title: str | None,
    north_star_provided: bool = False,
    north_star: str | None = None,
) -> None:
    if name is not None and name.strip():
        player.name = name.strip()
    if title_provided:
        player.equipped_title = equipped_title
    if north_star_provided:
        player.north_star = (north_star or "").strip()
    db.commit()


def set_book(db: Session, player: Player, current_book: str, day: str) -> None:
    """Set (or change) the book being read. Starts the weekly clock so the review
    only asks once a fresh week has begun."""
    player.current_book = (current_book or "").strip()
    player.book_started_week = game.week_key(day) if player.current_book else ""
    player.book_review_week = ""  # allow the next week's review to fire
    db.commit()


def review_book(db: Session, player: Player, finished: bool, next_book: str, day: str) -> None:
    """Answer the weekly reading review. Finished → count it and roll to the next
    book; not yet → keep the current one. Either way, don't ask again this week."""
    week = game.week_key(day)
    if finished:
        if player.current_book:
            player.books_finished += 1
        player.current_book = (next_book or "").strip()
        player.book_started_week = week if player.current_book else ""
    player.book_review_week = week
    db.commit()


def update_preferences(db: Session, player: Player, prefs: dict[str, list[str]]) -> None:
    """Replace each attribute's set of focuses with the given list (the client
    sends the full set, so adding keeps the existing ones). An empty list clears
    that attribute. Duplicates are dropped, order preserved, capped at 12."""
    existing = {p.stat: p for p in db.query(Preference).filter_by(player_id=player.id)}
    for stat, values in prefs.items():
        if stat not in game.STAT_KEYS:
            continue
        seen: set[str] = set()
        cleaned: list[str] = []
        for v in values or []:
            v = (v or "").strip()
            if v and v.lower() not in seen:
                seen.add(v.lower())
                cleaned.append(v)
        cleaned = cleaned[:12]
        row = existing.get(stat)
        if not cleaned:
            if row is not None:
                db.delete(row)
        elif row is not None:
            row.focus = json.dumps(cleaned)
        else:
            db.add(Preference(player_id=player.id, stat=stat, focus=json.dumps(cleaned)))
    db.commit()


def reset_all(db: Session, player: Player) -> None:
    db.query(Completion).filter_by(player_id=player.id).delete()
    db.query(AchievementUnlock).filter_by(player_id=player.id).delete()
    db.query(StepCheck).filter_by(player_id=player.id).delete()
    player.equipped_title = None
    player.created_at = utcnow()
    db.commit()
