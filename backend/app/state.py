"""The read model: turn stored completions into the state the app renders.

The completions table is the source of truth — XP, stat levels, streaks, ranks
and achievements are all *derived* here on read. Nothing in this module writes
to the database; mutations live in service.py. At personal scale these are a
handful of rows; when it grows, they become SQL queries with the same contract.
"""

import json
import re

from datetime import date, timedelta

from sqlalchemy.orm import Session

from . import body, digest, game, insights, llm, mailer, progression, quests, transcript
from .achievements import ACHIEVEMENTS, Snapshot
from .models import (
    AchievementUnlock,
    BudgetCommitment,
    Completion,
    GeneratedQuest,
    GroceryItem,
    JournalEntry,
    MoneyEntry,
    Player,
    Preference,
    QuestDef,
    Learning,
    QuestNote,
    ReadingLog,
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
    if not player.japanese_started_week:
        # Start the Japanese plan (kana → grammar → kanji) from this week.
        player.japanese_started_week = game.week_key(date.today().isoformat())
        db.commit()
    if not player.craft_started_week:
        # Start the 12-week system-design plan (foundations → … → design reps) now.
        player.craft_started_week = game.week_key(date.today().isoformat())
        db.commit()
    return player


# ── Row access ────────────────────────────────────────────────────────────────


def quest_defs(db: Session) -> list[QuestDef]:
    return db.query(QuestDef).filter_by(active=True).order_by(QuestDef.sort).all()


def completions_of(db: Session, player: Player) -> list[Completion]:
    return db.query(Completion).filter_by(player_id=player.id).all()


def _step_checks_by(db: Session, player: Player) -> dict[tuple[str, str], set[int]]:
    """Ticked step indices grouped by (quest_id, period_key) for this player — the
    read model and the progression inputs both need this same grouping."""
    checks: dict[tuple[str, str], set[int]] = {}
    for c in db.query(StepCheck).filter_by(player_id=player.id):
        checks.setdefault((c.quest_id, c.period_key), set()).add(c.step_index)
    return checks


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
        if game.is_rest(r.quest_id):
            rest_on.add(r.day)
        elif not game.is_marker(r.quest_id):
            completed.add((r.quest_id, r.day))

    checks = _step_checks_by(db, player)

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


def _jp_week(player: Player, day: str) -> int:
    """Which week of the Japanese plan the player is in (1-indexed; week 1 = the
    anchor week). 0 when the anchor isn't set yet."""
    return _weeks_since(player.japanese_started_week, day)


def _craft_phase_num(player: Player) -> int:
    """The phase of the system-design plan currently held. Deliberately not derived
    from the calendar — see `craft_of` for why."""
    return max(1, min(player.craft_phase or 1, quests.LAST_CRAFT_PHASE))


def _weeks_since(anchor: str, day: str) -> int:
    """Weeks from an ISO-week anchor to `day`, 1-indexed (week 1 = the anchor week).
    0 when the anchor isn't set yet."""
    if not anchor:
        return 0
    elapsed = (date.fromisoformat(day) - progression.week_start(anchor)).days
    return max(1, elapsed // 7 + 1)


def resolve_content(
    quest: QuestDef,
    day: str,
    *,
    prefs: dict[str, list[str]],
    gen_by: dict[tuple[str, str], dict],
    level: int,
    book: str,
    interview: bool,
    jp_week: int,
    craft_phase_num: int,
) -> tuple[str, str, list[str], str]:
    """The (title, desc, steps, resource) a quest shows today: LLM-generated
    content if present (with the mandatory leveled floor re-applied), else the
    handcrafted pool. The single resolver both the read model (`_quest_out`) and
    the step-toggle write path (`resolve_steps`) use, so a ticked step index and
    the displayed steps can never drift apart. Pure — inputs are pre-resolved."""
    pk = quests.period_key(quest.cadence, day)
    floor = quests.floor_for(quest, book, level)
    gen = gen_by.get((quest.id, pk))
    if gen is not None:
        steps = quests.cap_steps(floor + gen["steps"], len(floor))
        return gen["title"], gen["desc"], steps, gen["resource"]
    title, desc, steps, resource = quests.content_for(
        quest, day, prefs.get(quest.stat), book, level,
        interview=interview, jp_week=jp_week, craft_phase_num=craft_phase_num,
    )
    return title, desc, quests.cap_steps(steps, len(floor)), resource


def displayed_titles(db: Session, player: Player, day: str) -> dict[str, str]:
    """Slot id → the title that slot showed on `day`, resolved exactly the way the
    quest card resolved it (LLM content if it was cached, else the handcrafted pool
    variant for that period and level).

    The recap in the morning email names the quests you finished, and naming a slot
    something you never saw on screen ("Grimoire Study" for what the card called
    "Mind Map") reads as a different app. One resolver, so they can't drift."""
    prefs = preferences_of(db, player)
    gen_by = generated_by(db, player)
    levels = progression_levels(db, player, day)
    jp_week = _jp_week(player, day)
    craft_phase_num = _craft_phase_num(player)
    titles: dict[str, str] = {}
    for quest in quest_defs(db):
        title, _, _, _ = resolve_content(
            quest, day,
            prefs=prefs,
            gen_by=gen_by,
            level=levels.get(quest.stat, 0),
            book=player.current_book,
            interview=player.interview_mode,
            jp_week=jp_week,
            craft_phase_num=craft_phase_num,
        )
        titles[quest.id] = title
    return titles


def resolve_steps(db: Session, player: Player, quest: QuestDef, day: str) -> list[str]:
    """The step list a quest shows today, for the step-toggle write path — the same
    content the read model renders (see `resolve_content`), so a tick lands on the
    step the client actually showed."""
    _, _, steps, _ = resolve_content(
        quest, day,
        prefs=preferences_of(db, player),
        gen_by=generated_by(db, player),
        level=progression_levels(db, player, day).get(quest.stat, 0),
        book=player.current_book,
        interview=player.interview_mode,
        jp_week=_jp_week(player, day),
        craft_phase_num=_craft_phase_num(player),
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


# Physical and Reading show every day; the other dailies rotate over a 3-day cycle,
# so each day is a lighter set (the two mandatories + one group). Every area still
# comes around within three days. Keyed on the date's ordinal so it advances daily.
_DAILY_ALWAYS = ("d-train", "d-read")
_DAILY_ROTATION: list[list[str]] = [
    ["d-wealth", "d-craft"],       # build & money
    ["d-sketch", "d-jp"],          # create & language
    ["d-meditate", "d-connect"],   # inner & social
]


def active_daily_ids(day: str) -> set[str]:
    """The daily quests shown on `day`: Physical + Reading always, plus one rotating
    group so the daily load stays light. Non-daily quests are unaffected."""
    idx = date.fromisoformat(day).toordinal() % len(_DAILY_ROTATION)
    return {*_DAILY_ALWAYS, *_DAILY_ROTATION[idx]}


def dailies_cleared(rows: list[Completion], defs: list[QuestDef], day: str) -> bool:
    active = active_daily_ids(day)
    dailies = [q for q in defs if q.cadence == "daily" and q.id in active]
    return bool(dailies) and all(_count(rows, q.id, day=day) >= q.target for q in dailies)


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


def _top_stat(by_stat: dict[str, int]) -> str | None:
    """The attribute leaned into most (highest weight), or None when nothing counts
    yet — `aggregate` seeds every stat at 0, so an empty run must read as None."""
    top = max(by_stat, key=by_stat.get) if by_stat else None
    return top if top is not None and by_stat.get(top, 0) > 0 else None


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
               levels=None, interview=False, jp_week=0, craft_phase_num=0, notes_by=None) -> dict:
    pk = quests.period_key(q.cadence, day)
    title, desc, steps, resource = resolve_content(
        q, day,
        prefs=prefs,
        gen_by=gen_by or {},
        level=(levels or {}).get(q.stat, 0),
        book=book,
        interview=interview,
        jp_week=jp_week,
        craft_phase_num=craft_phase_num,
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
        # Notes jotted this period for this quest (write-steps log into here); the
        # client detects which steps are "write" steps from their wording.
        "notes": (notes_by or {}).get((q.id, pk), []),
    }


def reading_logs_of(db: Session, player: Player, since: str | None = None) -> list[ReadingLog]:
    """Every sitting logged for the *current* book, oldest first. Keyed on the title
    as well as the start day, so changing books never inherits the last one's
    chapters and re-reading the same title later starts from zero."""
    q = db.query(ReadingLog).filter_by(player_id=player.id, book=player.current_book)
    if since is not None:
        q = q.filter(ReadingLog.day >= since)
    return q.order_by(ReadingLog.created_at).all()


_CHAPTER_NUMBER = re.compile(r"\d+")


def furthest_chapter(label: str, total: int = 0) -> int:
    """The chapter a label says you reached — the highest number in it. "21–22" means
    you're 22 chapters into the book, not 2, which is how anyone reading it would
    describe where they are. 0 when the label names no chapter ("the intro").

    Clamped to the book's length when known, so a stray number in a label can't
    claim you're past the last chapter."""
    numbers = [int(n) for n in _CHAPTER_NUMBER.findall(label)]
    if not numbers:
        return 0
    reached = max(numbers)
    return min(reached, total) if total > 0 else reached


def chapters_covered(logs: list[ReadingLog], total: int = 0) -> int:
    """How far into the book the logged sittings put you.

    The furthest chapter named wins, because that's what "how far through are you"
    means — someone who joins mid-book at ch 21–22 is 22 in, not 2. Sittings logged
    as a bare count still move it, so the count is a floor the furthest chapter can
    only raise: logging ten unlabelled chapters and then naming "ch 2" mustn't wind
    progress back to 2."""
    counted = sum(log.chapters for log in logs)
    named = max((furthest_chapter(log.label, total) for log in logs), default=0)
    return max(counted, named)


def reading_of(db: Session, player: Player, day: str, rows: list[Completion], int_level: int) -> dict | None:
    """A read-only view of progress on the current book: how far in the logged
    chapters put you, from the hunter's own logging rather than a quota the app set.
    When the book's length is unknown there's no denominator to measure chapters
    against, so it falls back to days of reading done (`measure` says which). None
    when no book is set."""
    book = player.current_book
    if not book:
        return None
    start = progression.week_start(player.book_started_week) if player.book_started_week else None
    floor = start.isoformat() if start is not None else None

    logs = reading_logs_of(db, player, floor)
    chapters_read = chapters_covered(logs, player.current_book_chapters)
    today = [log for log in logs if log.day == day]

    read_days = {r.day for r in rows if r.quest_id == "d-read"}
    if floor is not None:  # only count reading done since this book began
        read_days = {d for d in read_days if d >= floor}
    days_read = len(read_days)

    total = player.current_book_chapters
    days_target = quests.days_to_finish(int_level)
    if total > 0:
        progress = min(1.0, chapters_read / total)
    else:
        progress = min(1.0, days_read / days_target) if days_target else 0.0

    return {
        "book": book,
        "chapters": total,
        "books_finished": player.books_finished,
        "chapters_read": chapters_read,
        "days_read": days_read,
        "days_to_finish": days_target,
        "progress": round(progress, 3),
        "measure": "chapters" if total > 0 else "days",
        "logged_today": [
            {"id": log.id, "label": log.label, "chapters": log.chapters} for log in today
        ],
        "done_today": bool(today) or day in read_days,
    }


def notion_study_of(db: Session, player: Player, after: str | None = None) -> list[Learning]:
    """Everything logged from Notion, oldest first — the Craft equivalent of the
    reading log.

    `after` is the day a phase began, and the bound is strictly after it: the reading
    that carried you to the end of a phase belongs to that phase, not to the next one,
    so the new phase's bar starts empty on the day you move."""
    q = db.query(Learning).filter_by(player_id=player.id, kind="notion")
    if after:
        q = q.filter(Learning.day > after)
    return q.order_by(Learning.created_at).all()


def craft_of(db: Session, player: Player, day: str) -> dict:
    """Where the hunter is in the system-design plan, measured in what they've read.

    Deliberately not a calendar. The phase holds until they say its material is read,
    exactly like a book that carries on for as many weeks as it takes: a plan that
    advanced on dates would march them past chapters they hadn't opened, which is the
    same failure as a chapters-per-day quota.

    `studied` counts the Notion pages logged since this phase began and `pieces` is
    what the phase is made of, so the bar answers 'how far in am I'. `pending` asks —
    once, and at most weekly — whether the phase is done; answering is the only thing
    that moves it."""
    phase_num = _craft_phase_num(player)
    info = quests.craft_phase_info(phase_num)
    studied = len(notion_study_of(db, player, player.craft_phase_day or None))
    pieces = info["pieces"]
    progress = min(1.0, studied / pieces) if pieces else 0.0
    return {
        "phase": phase_num,
        "phases": quests.LAST_CRAFT_PHASE,
        "label": info["label"],
        "detail": info["detail"],
        "studied": studied,
        "pieces": pieces,
        "progress": round(progress, 3),
        "is_last": phase_num >= quests.LAST_CRAFT_PHASE,
        "pending": bool(
            progress >= 1.0
            and phase_num < quests.LAST_CRAFT_PHASE
            and player.craft_review_week != game.week_key(day)
        ),
    }


def history_of(db: Session, player: Player, limit: int = 200) -> list[dict]:
    """A dated log of finished quests, newest first — every completion resolved to
    its quest's title, area (stat) and cadence. Skips the rest-day and daily-clear
    markers (they aren't quests). Capped so the payload stays small; the raw rows
    live in the DB regardless. Powers the You → History screen."""
    by_id = {d.id: d for d in quest_defs(db)}
    out: list[dict] = []
    for r in (
        db.query(Completion)
        .filter_by(player_id=player.id)
        .order_by(Completion.at.desc())
    ):
        if game.is_marker(r.quest_id):
            continue
        q = by_id.get(r.quest_id)
        out.append({
            "id": r.id,
            "quest_id": r.quest_id,
            "title": q.title if q else r.quest_id,
            "stat": q.stat if q else "",
            "cadence": q.cadence if q else "",
            "xp": r.xp,
            "day": r.day,
            "at": r.at,
        })
        if len(out) >= limit:
            break
    return out


def week_review_of(rows: list[Completion], defs: list[QuestDef], day: str) -> dict:
    """A gentle recap of the current ISO week: what got done, XP earned, days you
    showed up, days fully cleared, and the area you leaned into. Pure derive-on-read."""
    week = game.week_key(day)
    by_id = {d.id: d for d in defs}
    week_rows = [r for r in rows if game.week_key(r.day) == week]
    by_stat: dict[str, int] = {}
    completions = 0
    for r in week_rows:
        if game.is_marker(r.quest_id):
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


def _reflections_and_notes(
    db: Session, player: Player, defs: list[QuestDef]
) -> tuple[dict[tuple[str, str], list[dict]], list[dict]]:
    """Group this-period quest notes onto their quest (so each card shows what's
    been jotted) and collect them all, newest first, for the Reflections view."""
    stat_by_qid = {q.id: q.stat for q in defs}
    notes_by: dict[tuple[str, str], list[dict]] = {}
    reflections: list[dict] = []
    for n in sorted(db.query(QuestNote).filter_by(player_id=player.id), key=lambda n: n.created_at):
        notes_by.setdefault((n.quest_id, n.period_key), []).append(
            {"id": n.id, "text": n.text, "step": n.step_index}
        )
        reflections.append({
            "id": n.id,
            "quest_id": n.quest_id,
            "stat": stat_by_qid.get(n.quest_id, ""),
            "prompt": n.prompt or "",
            "day": n.day,
            "text": n.text,
            "created_at": n.created_at,
        })
    reflections.reverse()  # newest first
    return notes_by, reflections


def _journal_of(db: Session, player: Player) -> list[dict]:
    """Free-form daily journal entries, most-recently-updated first (falling back to
    created_at for entries written before edits were tracked)."""
    rows = db.query(JournalEntry).filter_by(player_id=player.id).all()
    rows.sort(key=lambda e: e.updated_at or e.created_at, reverse=True)
    return [
        {"id": e.id, "day": e.day, "text": e.text,
         "created_at": e.created_at, "updated_at": e.updated_at or e.created_at}
        for e in rows
    ]


def _reminders_of(db: Session, player: Player) -> list[dict]:
    """The to-do list: open items first (by when added), finished ones after. The
    client shows the open ones on Status and the finished ones on the You record."""
    return [
        {"id": r.id, "text": r.text, "done": r.done, "done_at": r.done_at}
        for r in sorted(
            db.query(Reminder).filter_by(player_id=player.id),
            key=lambda r: (r.done, r.created_at),
        )
    ]


def _grocery_of(db: Session, player: Player) -> list[dict]:
    """The grocery list: still-to-buy first, bought ones settle to the bottom. The
    client shows to-buy on the Body tab and bought ones on the You record."""
    return [
        {"id": g.id, "name": g.name, "bought": g.bought, "bought_at": g.bought_at}
        for g in sorted(
            db.query(GroceryItem).filter_by(player_id=player.id),
            key=lambda g: (g.bought, g.created_at),
        )
    ]


def _priorities_of(player: Player, day: str) -> list[dict]:
    """The pinned priorities (one per attribute), each still in scope — they sit on
    top of the plan for their category. 'day' lives for its day, 'week' for its ISO
    week, 'open' until cleared. Content is handcrafted (free). Ordered by STAT_KEYS."""
    try:
        stored = json.loads(player.priorities or "{}")
    except (ValueError, TypeError):
        stored = {}
    out: list[dict] = []
    for stat in game.STAT_KEYS:
        p = stored.get(stat)
        if not isinstance(p, dict) or not p.get("focus"):
            continue
        scope, period = p.get("scope", "week"), p.get("period", "")
        if scope == "day" and period != day:
            continue
        if scope == "week" and period != game.week_key(day):
            continue
        title, note, steps = quests.priority_content(p["focus"])
        out.append({"stat": stat, "focus": p["focus"], "scope": scope,
                    "title": title, "note": note, "steps": steps})
    return out


def _money_of(db: Session, player: Player, day: str) -> dict:
    """The money *summary* the tracker headline needs — today's and this ISO week's
    in/out, plus the all-time balance. Deliberately no entry list: entries are
    fetched per-period from /money/history, so /state stays small no matter how
    much history piles up."""
    rows = db.query(MoneyEntry).filter_by(player_id=player.id).all()
    week = game.week_key(day)

    def total(direction: str, pred) -> float:
        return round(sum(r.amount for r in rows if r.direction == direction and pred(r)), 2)

    always = lambda r: True  # noqa: E731 — all-time predicate
    return {
        "today_in": total("in", lambda r: r.day == day),
        "today_out": total("out", lambda r: r.day == day),
        "week_in": total("in", lambda r: game.week_key(r.day) == week),
        "week_out": total("out", lambda r: game.week_key(r.day) == week),
        # One pool: the take-home pay is logged as a 'money in' (see set_monthly_income),
        # so remaining is a plain everything-in minus everything-out. That in-entry is
        # what makes this equal the budget salary at a fresh, unspent start.
        "balance": round(total("in", always) - total("out", always), 2),
    }


def _budget_of(db: Session, player: Player, day: str) -> dict:
    """Take-home pay, the standing commitments it's divided across, and what's
    actually been spent this month against each bucket.

    Raw figures only. The 50/30/20 targets and the derived savings number are *not*
    computed here: the worksheet recalculates them as you type, so the formulas live
    in one place on the client (src/lib/budget.ts) rather than in two that can
    disagree.

    `paid_this_month` on each commitment is what stops rent being typed twice — the
    app shows unpaid ones as a tappable list and one tap writes the ledger entry."""
    rows = (
        db.query(BudgetCommitment)
        .filter(BudgetCommitment.player_id == player.id)
        # Dated bills first in due order, then undated allowances (due_day 0). The
        # leading term is a boolean — 0 for dated, 1 for not — so "no date" sinks to
        # the bottom instead of floating above the 1st of the month.
        .order_by(BudgetCommitment.due_day == 0, BudgetCommitment.due_day, BudgetCommitment.created_at)
        .all()
    )

    month = day[:7]  # 'YYYY-MM'
    entries = (
        db.query(MoneyEntry)
        .filter(MoneyEntry.player_id == player.id, MoneyEntry.day.startswith(month))
        .all()
    )
    spent = [e for e in entries if e.direction == "out"]
    paid_ids = {e.commitment_id for e in spent if e.commitment_id}

    def total(bucket: str | None) -> float:
        return round(sum(e.amount for e in spent if e.bucket == bucket), 2)

    # Everything that came in this month — take-home plus any extra. This is what the
    # 50/30/20 lines divide, so the rule follows real money in, not a stored setting.
    income_in = round(sum(e.amount for e in entries if e.direction == "in"), 2)

    return {
        "monthly_income": round(player.monthly_income or 0, 2),
        "start_month": player.budget_start_month or "",
        "month": month,
        "commitments": [
            {
                "id": r.id,
                "label": r.label,
                "amount": r.amount,
                "bucket": r.bucket,
                "due_day": r.due_day,
                "variable": r.variable,
                "active": r.active,
                "paid_this_month": r.id in paid_ids,
            }
            for r in rows
        ],
        # What actually left the wallet this month, per bucket. `untagged` is
        # spending from before the budget existed (or logged without a tag) — surfaced
        # honestly rather than folded into a bucket it was never assigned.
        "actual": {
            "income": income_in,
            "needs": total("needs"),
            "wants": total("wants"),
            "untagged": total(None),
        },
    }


def _period_range(scope: str, day: str) -> tuple[str, str]:
    """The [start, end] 'YYYY-MM-DD' span for a day / ISO week / calendar month
    containing `day` (both inclusive)."""
    d = date.fromisoformat(day)
    if scope == "day":
        return day, day
    if scope == "month":
        start = d.replace(day=1)
        end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return start.isoformat(), end.isoformat()
    monday = d - timedelta(days=d.weekday())  # week (Mon–Sun)
    return monday.isoformat(), (monday + timedelta(days=6)).isoformat()


def money_history(db: Session, player: Player, scope: str, day: str) -> dict:
    """One period of the money log — its entries (newest first), per-day buckets for
    the chart, and earned/spent/net totals. Bounded by the period, so reviewing
    months of history is many small reads rather than one giant payload."""
    if scope not in ("day", "week", "month"):
        scope = "week"
    start, end = _period_range(scope, day)
    rows = (
        db.query(MoneyEntry)
        .filter(MoneyEntry.player_id == player.id, MoneyEntry.day >= start, MoneyEntry.day <= end)
        .all()
    )
    buckets: dict[str, dict] = {}
    cur, last = date.fromisoformat(start), date.fromisoformat(end)
    while cur <= last:
        buckets[cur.isoformat()] = {"day": cur.isoformat(), "earned": 0.0, "spent": 0.0}
        cur += timedelta(days=1)
    earned = spent = 0.0
    for r in rows:
        b = buckets.get(r.day)
        if b is None:
            continue
        if r.direction == "in":
            b["earned"] += r.amount
            earned += r.amount
        else:
            b["spent"] += r.amount
            spent += r.amount
    return {
        "scope": scope,
        "start": start,
        "end": end,
        "earned": round(earned, 2),
        "spent": round(spent, 2),
        "net": round(earned - spent, 2),
        "buckets": [
            {"day": b["day"], "earned": round(b["earned"], 2), "spent": round(b["spent"], 2)}
            for b in (buckets[k] for k in sorted(buckets))
        ],
        "entries": [
            {"id": r.id, "amount": r.amount, "direction": r.direction, "note": r.note,
             "day": r.day, "created_at": r.created_at,
             "bucket": r.bucket, "commitment_id": r.commitment_id}
            for r in sorted(rows, key=lambda r: r.created_at, reverse=True)
        ],
    }


def _achievements_of(db: Session, player: Player) -> list[dict]:
    """Every achievement with its unlocked_at (None while still locked)."""
    unlocks = {
        u.achievement_id: u.unlocked_at
        for u in db.query(AchievementUnlock).filter_by(player_id=player.id)
    }
    return [
        {"id": a.id, "name": a.name, "desc": a.desc, "title_reward": a.title_reward,
         "unlocked_at": unlocks.get(a.id)}
        for a in ACHIEVEMENTS
    ]


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

    active_ids = active_daily_ids(day)  # Physical + today's rotating group
    dailies = [q for q in defs if q.cadence == "daily" and q.id in active_ids]
    dailies_done = sum(1 for q in dailies if _count(rows, q.id, day=day) >= q.target)
    resting = any(game.is_rest(r.quest_id) and r.day == day for r in rows)

    # Reading review: a book is never reset by a week ending — it carries on, with
    # its progress intact, for as many weeks as it takes. The gentle "did you
    # finish?" check-in appears only once the logged chapters cover the book (or,
    # when its length is unknown, once enough days of reading are in), and then at
    # most once a week so it never nags.
    week = game.week_key(day)
    reading = reading_of(db, player, day, rows, prog_levels.get("INT", 0))
    review_pending = bool(
        player.current_book
        and reading
        and reading["progress"] >= 1.0
        and player.book_review_week != week
    )

    checks_by = _step_checks_by(db, player)
    notes_by, reflections = _reflections_and_notes(db, player, defs)

    def undoable_id(quest: QuestDef) -> str | None:
        todays = [r for r in rows if r.quest_id == quest.id and r.day == day]
        return max(todays, key=lambda r: r.at).id if todays else None

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
        "craft": craft_of(db, player, day),
        "reading": reading,
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
        "digest_enabled": mailer.enabled(),
        "daily_quote": insights.daily_quote(db, player.id, day),
        "quests": [
            _quest_out(q, day, rows, prefs, undoable_id, checks_by, player.current_book, gen_by,
                       prog_levels, player.interview_mode, _jp_week(player, day),
                       _craft_phase_num(player), notes_by)
            for q in defs
            if q.cadence != "daily" or q.id in active_ids  # only today's dailies show
        ],
        "achievements": _achievements_of(db, player),
        "record": {
            "active_days": len(agg["active_days"]),
            "total_completions": agg["total_completions"],
            "xp": agg["total_xp"],
            "days_cleared": len(agg["bonus_days"]),
            # The area leaned into most across all time (by XP), or None if nothing yet.
            "top_stat": _top_stat(agg["by_stat"]),
        },
        "priorities": _priorities_of(player, day),
        "reminders": _reminders_of(db, player),
        "grocery": _grocery_of(db, player),
        "money": _money_of(db, player, day),
        "budget": _budget_of(db, player, day),
        "journal": _journal_of(db, player),  # free-form daily entries, newest first
        "reflections": reflections,  # quest-linked takeaways, newest first
        "learnings": digest.list_learnings(db, player.id, day),  # what you read today
        "recall": digest.recall_set(db, player, day),  # older highlights coming back around
        "thread": digest.thread_for(db, player, day),  # the running summary of the book
    }
