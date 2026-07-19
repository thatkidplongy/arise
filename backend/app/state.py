"""The read model: turn stored completions into the state the app renders.

The completions table is the source of truth — XP, stat levels, streaks, ranks
and achievements are all *derived* here on read. Nothing in this module writes
to the database; mutations live in service.py. At personal scale these are a
handful of rows; when it grows, they become SQL queries with the same contract.
"""

import json

from datetime import date

from sqlalchemy.orm import Session

from . import body, game, insights, llm, progression, quests, transcript
from .achievements import ACHIEVEMENTS, Snapshot
from .models import (
    AchievementUnlock,
    Completion,
    GeneratedQuest,
    Player,
    Preference,
    QuestDef,
    Reminder,
    StepCheck,
)


def get_or_create_player(db: Session) -> Player:
    player = db.query(Player).first()
    if player is None:
        player = Player()
        db.add(player)
        db.commit()
        db.refresh(player)
    if not player.progression_start_week:
        # Anchor progression to now the first time we see this player, so past
        # history never counts retroactively — every attribute begins at Lv 0.
        # (Single-user, server-local: date.today() is the hunter's own date.)
        player.progression_start_week = game.week_key(date.today().isoformat())
        db.commit()
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


def levels_of(db: Session, player: Player) -> dict[str, str]:
    """The optional 'where I'm at' note per attribute (drives LLM sequencing)."""
    out: dict[str, str] = {}
    for p in db.query(Preference).filter_by(player_id=player.id):
        if (p.level or "").strip():
            out[p.stat] = p.level.strip()
    return out


# ── Progression (earned difficulty) ───────────────────────────────────────────


def _progression_inputs(db: Session, player: Player) -> tuple[dict[str, set[str]], dict[str, set[str]]]:
    """For each attribute, the days its floor was met and the rest days that
    protected it — the raw material progression.compute replays into levels.

    A day counts as *floor met* if the attribute's daily quest was completed, or
    (for a floored area) all its floor steps were ticked — so doing just the
    non-negotiable is enough. A rest day protects an attribute only on a day its
    floor wasn't independently met, so the two sets stay disjoint."""
    rows = completions_of(db, player)
    completed: set[tuple[str, str]] = set()
    rest_on: set[str] = set()
    for r in rows:
        if r.quest_id == game.REST_DAY_ID:
            rest_on.add(r.day)
        elif r.quest_id != game.DAILY_CLEAR_ID:
            completed.add((r.quest_id, r.day))

    checks: dict[tuple[str, str], set[int]] = {}
    for c in db.query(StepCheck).filter_by(player_id=player.id):
        checks.setdefault((c.quest_id, c.period_key), set()).add(c.step_index)

    real_days: dict[str, set[str]] = {stat: set() for stat in game.STAT_KEYS}
    rest_days: dict[str, set[str]] = {stat: set() for stat in game.STAT_KEYS}
    for stat in game.STAT_KEYS:
        qid = progression.DAILY_BY_STAT[stat]
        flen = progression.FLOOR_LEN.get(qid, 0)
        candidate_days = {d for (q, d) in completed if q == qid} | {d for (q, d) in checks if q == qid}
        for d in candidate_days:
            met = (qid, d) in completed
            if not met and flen > 0:
                met = all(i in checks.get((qid, d), set()) for i in range(flen))
            if met:
                real_days[stat].add(d)
        for d in rest_on:
            if d not in real_days[stat]:
                rest_days[stat].add(d)
    return real_days, rest_days


def progression_of(db: Session, player: Player, day: str) -> dict[str, dict]:
    """Per-attribute progression (level, peak, band, this-week progress) derived
    from history. Pure read — the anchor week is set once in get_or_create_player."""
    real_days, rest_days = _progression_inputs(db, player)
    start_wk = player.progression_start_week or game.week_key(day)
    start = progression.week_start(start_wk)
    return progression.compute(real_days, rest_days, start, date.fromisoformat(day))


def progression_levels(db: Session, player: Player, day: str) -> dict[str, int]:
    """Just the current level per attribute — the number that drives floors/bands."""
    return {stat: info["level"] for stat, info in progression_of(db, player, day).items()}


def _gen_steps(raw: str) -> list[str]:
    try:
        val = json.loads(raw)
    except (ValueError, TypeError):
        return []
    return [str(s) for s in val] if isinstance(val, list) else []


def generated_by(db: Session, player: Player) -> dict[tuple[str, str], dict]:
    """Cached LLM content keyed by (quest_id, period_key). Empty when the LLM is
    off or nothing's been generated yet."""
    out: dict[tuple[str, str], dict] = {}
    for g in db.query(GeneratedQuest).filter_by(player_id=player.id):
        out[(g.quest_id, g.period_key)] = {
            "title": g.title,
            "desc": g.desc,
            "steps": _gen_steps(g.steps),
            "resource": g.resource,
        }
    return out


def resolve_steps(db: Session, player: Player, quest: QuestDef, day: str) -> list[str]:
    """The full step list a quest shows today — generated content if present,
    else the pool — always with the mandatory (leveled) floor prepended. Shared by
    the read model and the step-toggle write path so they never disagree."""
    level = progression_levels(db, player, day).get(quest.stat, 0)
    chapters = player.current_book_chapters
    pk = quests.period_key(quest.cadence, day)
    g = db.get(
        GeneratedQuest,
        {"player_id": player.id, "quest_id": quest.id, "period_key": pk},
    )
    if g is not None:
        return quests.floor_for(quest, player.current_book, level, chapters) + _gen_steps(g.steps)
    prefs = preferences_of(db, player)
    _, _, steps, _ = quests.content_for(
        quest, day, prefs.get(quest.stat), player.current_book, level, chapters,
        interview=player.interview_mode,
    )
    return steps


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
    # Dailies count within the day; weekly and side count within the ISO week.
    if quest.cadence == "daily":
        return _count(rows, quest.id, day=day)
    return _count(rows, quest.id, week=game.week_key(day))


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


def _quest_out(q: QuestDef, day: str, rows, prefs, undoable_id, checks_by, book="", gen_by=None,
               levels=None, chapters=0, interview=False) -> dict:
    level = (levels or {}).get(q.stat, 0)
    pk = quests.period_key(q.cadence, day)
    gen = (gen_by or {}).get((q.id, pk))
    if gen is not None:  # LLM-personalised, with the mandatory floor re-applied
        title, desc = gen["title"], gen["desc"]
        steps = quests.floor_for(q, book, level, chapters) + gen["steps"]
        resource = gen["resource"]
    else:
        title, desc, steps, resource = quests.content_for(
            q, day, prefs.get(q.stat), book, level, chapters, interview=interview
        )
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


def reading_of(db: Session, player: Player, day: str, rows: list[Completion], int_level: int) -> dict | None:
    """A read-only view of progress on the current book, measured by how many days
    the reading daily was actually done since the book began — so the Status screen
    can show 'how far to finishing', grounded in real quest completions rather than
    elapsed time. None when no book is set."""
    book = player.current_book
    if not book:
        return None
    days_target = quests.days_to_finish(int_level)
    start = progression.week_start(player.book_started_week) if player.book_started_week else None
    read_days = {r.day for r in rows if r.quest_id == "d-read"}
    if start is not None:  # only count reading done since this book began
        floor = start.isoformat()
        read_days = {d for d in read_days if d >= floor}
    days_read = len(read_days)
    progress = min(1.0, days_read / days_target) if days_target else 0.0
    return {
        "book": book,
        "chapters": player.current_book_chapters,
        "books_finished": player.books_finished,
        "days_read": days_read,
        "days_to_finish": days_target,
        "progress": round(progress, 3),
        "per_day": quests.reading_floor(book, int_level, player.current_book_chapters),
        "done_today": day in read_days,
    }


def week_review_of(rows: list[Completion], defs: list[QuestDef], day: str) -> dict:
    """A gentle recap of the current ISO week: what got done, XP earned, days you
    showed up, days fully cleared, and the area you leaned into. Pure derive-on-read."""
    week = game.week_key(day)
    by_id = {d.id: d for d in defs}
    week_rows = [r for r in rows if game.week_key(r.day) == week]
    by_stat: dict[str, int] = {}
    completions = 0
    for r in week_rows:
        if r.quest_id in (game.REST_DAY_ID, game.DAILY_CLEAR_ID):
            continue
        q = by_id.get(r.quest_id)
        if q is None:
            continue
        by_stat[q.stat] = by_stat.get(q.stat, 0) + 1
        completions += 1
    return {
        "week": week,
        "xp": sum(r.xp for r in week_rows),
        "completions": completions,
        "active_days": len({r.day for r in week_rows}),
        "days_cleared": len({r.day for r in week_rows if r.quest_id == game.DAILY_CLEAR_ID}),
        "by_stat": by_stat,
        "top_stat": max(by_stat, key=by_stat.get) if by_stat else None,
    }


def build_state(db: Session, player: Player, day: str) -> dict:
    defs = quest_defs(db)
    rows = completions_of(db, player)
    prefs = preferences_of(db, player)
    levels = levels_of(db, player)
    prog = progression_of(db, player, day)
    prog_levels = {stat: info["level"] for stat, info in prog.items()}
    gen_by = generated_by(db, player)
    agg = aggregate(rows, defs)

    # Self-care counts: skincare routine completions feed Spirit (and overall XP).
    sc_xp = body.skincare_stats(db, player.id, day)["xp"]
    if sc_xp:
        agg["by_stat"]["SPI"] += sc_xp
        agg["total_xp"] += sc_xp

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
            "current_book_chapters": player.current_book_chapters,
            "books_finished": player.books_finished,
            "interview_mode": player.interview_mode,
            "has_avatar": bool(player.avatar),
        },
        "book_review": {"pending": review_pending, "book": player.current_book},
        "reading": reading_of(db, player, day, rows, prog_levels.get("INT", 0)),
        "week_review": week_review_of(rows, defs, day),
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
        "levels": levels,
        "progression": prog,
        "llm_enabled": llm.enabled(),
        "transcript_enabled": transcript.enabled(),
        "daily_quote": insights.daily_quote(db, player.id, day),
        "quests": [
            _quest_out(q, day, rows, prefs, undoable_id, checks_by, player.current_book, gen_by,
                       prog_levels, player.current_book_chapters, player.interview_mode)
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
        "reminders": [
            {"id": r.id, "text": r.text}
            for r in db.query(Reminder).filter_by(player_id=player.id).order_by(Reminder.created_at)
        ],
    }
