"""Write operations — everything that changes the database.

Each public action commits and returns the freshly-rebuilt state (via
state.build_state), so a route is a thin wrapper: get the player, call one of
these, return the result. Reads and derivation live in state.py.
"""

import json

from fastapi import HTTPException
from sqlalchemy.orm import Session

from datetime import date, timedelta

from . import game, llm, progression, quests
from .achievements import ACHIEVEMENTS
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
    QuestNote,
    ReadingLog,
    Reminder,
    StepCheck,
    utcnow,
)
from .state import (
    _parse_focus,
    aggregate,
    build_state,
    completions_of,
    dailies_cleared,
    done_count,
    has_bonus,
    levels_of,
    preferences_of,
    progression_of,
    quest_defs,
    resolve_steps,
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
    # Match the quest's own period (weekly + side share the ISO-week period).
    pk = quests.period_key(quest.cadence, day)
    candidates = [
        r for r in rows
        if r.quest_id == quest.id and quests.period_key(quest.cadence, r.day) == pk
    ]
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


def _clear_quest_notes(
    db: Session, player: Player, quest_id: str, period_key: str, step_index: int | None = None
) -> None:
    """Remove reflections written for a quest's period. With `step_index`, only the
    note for that step; without, every note for the period. A reflection is a
    write-step's answer, so it goes when that step (or the whole quest) is undone."""
    q = db.query(QuestNote).filter_by(
        player_id=player.id, quest_id=quest_id, period_key=period_key
    )
    if step_index is not None:
        q = q.filter_by(step_index=step_index)
    q.delete()


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

    # Reset the quest's checklist for this period so it starts fresh, and drop the
    # reflections written for it — undoing the quest means it wasn't done.
    quest = next((q for q in quest_defs(db) if q.id == quest_id), None)
    if quest is not None:
        pk = quests.period_key(quest.cadence, row_day)
        _clear_step_checks(db, player, quest_id, pk)
        _clear_quest_notes(db, player, quest_id, pk)

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

    steps = resolve_steps(db, player, quest, day)
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
        # Unticking a write-step retracts its reflection too (the note was that
        # step's answer). Older notes have no step_index and are left alone.
        _clear_quest_notes(db, player, quest.id, pk, step_index)
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


def log_reading(db: Session, player: Player, day: str, chapters: int, label: str) -> None:
    """Record a sitting of reading — which chapters, and how many. This is the only
    thing that moves a book toward finished, so it's the hunter's count rather than
    a target the app set. Several sittings in a day are fine; they add up."""
    db.add(ReadingLog(
        player_id=player.id,
        day=day,
        book=player.current_book,
        chapters=max(1, chapters),  # a logged sitting always counts for something
        label=label.strip(),
    ))
    db.commit()


def remove_reading_log(db: Session, player: Player, log_id: str) -> None:
    """Take back a logged sitting — a mistyped count shouldn't be permanent."""
    row = db.get(ReadingLog, log_id)
    if row is not None and row.player_id == player.id:
        db.delete(row)
        db.commit()


def set_book(db: Session, player: Player, current_book: str, day: str, chapters: int = 0) -> None:
    """Set (or change) the book being read. The book then carries on for as many
    weeks as it takes — a week ending never resets it. `chapters` (optional) is the
    book's length — the finish line progress is measured against, never a per-day
    quota; 0 leaves it unknown and progress falls back to days read.
    `book_review_week` is cleared so the finish check-in can fire again."""
    player.current_book = (current_book or "").strip()
    player.current_book_chapters = max(0, chapters) if player.current_book else 0
    player.book_started_week = game.week_key(day) if player.current_book else ""
    player.book_review_week = ""  # allow the next week's review to fire
    _clear_generated(db, player)  # a new book should re-personalise the reading day
    db.commit()


def review_craft_phase(db: Session, player: Player, done: bool, day: str) -> None:
    """Answer the system-design phase check-in. Done → move to the next phase and
    start counting its study from today; not yet → hold where you are, and don't ask
    again this week. Nothing here is on a clock: a phase you're still reading simply
    stays, for as long as it takes."""
    week = game.week_key(day)
    if done and player.craft_phase < quests.LAST_CRAFT_PHASE:
        player.craft_phase += 1
        player.craft_phase_day = day
        _clear_generated(db, player)  # a new phase should re-personalise the slot
    player.craft_review_week = week
    db.commit()


def set_interview_mode(db: Session, player: Player, enabled: bool) -> None:
    """Turn Craft's interview-prep mode on or off. Clears the LLM cache so the
    next generation reflects the new mode (the pools switch immediately regardless)."""
    player.interview_mode = bool(enabled)
    _clear_generated(db, player)
    db.commit()


def review_book(db: Session, player: Player, finished: bool, next_book: str, day: str) -> None:
    """Answer the reading check-in. Finished → count it and roll to the next book;
    not yet → keep the current one and carry its progress on. Either way, don't ask
    again this week (it re-appears next week only if still past the finish pace)."""
    week = game.week_key(day)
    if finished:
        if player.current_book:
            player.books_finished += 1
        player.current_book = (next_book or "").strip()
        player.current_book_chapters = 0  # new book, length unknown until set
        player.book_started_week = week if player.current_book else ""
    player.book_review_week = week
    db.commit()


def _clear_generated(db: Session, player: Player) -> None:
    """Drop cached LLM content so the next generation reflects a changed profile."""
    db.query(GeneratedQuest).filter_by(player_id=player.id).delete()


def _profile(db: Session, player: Player, day: str) -> dict:
    prefs = preferences_of(db, player)
    levels = levels_of(db, player)
    prog = progression_of(db, player, day)
    attrs: dict[str, dict] = {}
    for stat in game.STAT_KEYS:
        info: dict = {}
        if prefs.get(stat):
            info["focus"] = prefs[stat]
        if levels.get(stat):
            info["level"] = levels[stat]
        p = prog.get(stat)
        if p:
            # Earned difficulty — the LLM should pitch each quest at this tier.
            info["tier"] = p["level"]
            info["band"] = progression.BAND_LABELS.get(p["band"], "foundation")
        if info:
            attrs[stat] = info
    cutoff = (date.fromisoformat(day) - timedelta(days=7)).isoformat()
    counts: dict[str, int] = {}
    for r in completions_of(db, player):
        if r.day >= cutoff and not game.is_marker(r.quest_id):
            counts[r.quest_id] = counts.get(r.quest_id, 0) + 1
    return {
        "name": player.name,
        "north_star": player.north_star,
        "current_book": player.current_book,
        "interview_mode": player.interview_mode,
        "attributes": attrs,
        "recent": ", ".join(f"{k}×{v}" for k, v in sorted(counts.items())),
    }


def generate_quests(db: Session, player: Player, day: str) -> dict:
    """Personalise this period's uncached quests via the LLM in one call, caching
    the result. No key, nothing to generate, or any failure → state is unchanged
    (the handcrafted pools). The mandatory floor is re-applied on read, so this
    can never drop a non-negotiable."""
    if not llm.enabled():
        return build_state(db, player, day)
    defs = quest_defs(db)
    prog = progression_of(db, player, day)
    slots = []
    for q in defs:
        if q.id == "d-jp":
            continue  # Japanese follows a fixed phased plan, not the LLM
        if q.id == "d-craft" and not player.interview_mode:
            # Craft's daily follows the 12-week system-design plan and points at the
            # hunter's own Notion pages, which the LLM has never seen — anything it
            # invented here would send them somewhere that doesn't exist. Interview
            # mode isn't phase-bound, so it keeps its generated variety.
            continue
        pk = quests.period_key(q.cadence, day)
        if db.get(GeneratedQuest, {"player_id": player.id, "quest_id": q.id, "period_key": pk}):
            continue
        band = prog.get(q.stat, {}).get("band", 0)
        title, desc, steps = quests.pool_variant(q, day, band, player.interview_mode)
        slots.append(
            {"id": q.id, "stat": q.stat, "cadence": q.cadence,
             "theme": title, "example_desc": desc, "example_steps": steps,
             "tier": prog.get(q.stat, {}).get("level", 0),
             "band": progression.BAND_LABELS.get(band, "foundation"),
             "interview": player.interview_mode and q.id in quests.INTERVIEW_POOLS}
        )
    if not slots:
        return build_state(db, player, day)
    try:
        generated = llm.generate(slots, _profile(db, player, day))
    except Exception as err:  # transport/parse/timeout — never fatal
        llm.log_failure(err)
        return build_state(db, player, day)
    for q in defs:
        g = generated.get(q.id)
        if not g:
            continue  # slot the model skipped → keep the pool for it
        pk = quests.period_key(q.cadence, day)
        db.merge(
            GeneratedQuest(
                player_id=player.id, quest_id=q.id, period_key=pk,
                title=g["title"], desc=g["desc"],
                steps=json.dumps(g["steps"]), resource=g.get("resource", ""),
            )
        )
    db.commit()
    return build_state(db, player, day)


def _clean_focus(values: list[str]) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for v in values or []:
        v = (v or "").strip()
        if v and v.lower() not in seen:
            seen.add(v.lower())
            out.append(v)
    return out[:12]


def update_preferences(
    db: Session,
    player: Player,
    prefs: dict[str, list[str]] | None = None,
    levels: dict[str, str] | None = None,
) -> None:
    """Update each attribute's focus set (client sends the full set) and/or its
    "where I'm at" level note. A stat only in one dict keeps the other field. A
    row is deleted only when both focus and level end up empty. Changing the
    profile clears the LLM cache so the next generation reflects it."""
    prefs = prefs or {}
    levels = levels or {}
    existing = {p.stat: p for p in db.query(Preference).filter_by(player_id=player.id)}
    for stat in set(prefs) | set(levels):
        if stat not in game.STAT_KEYS:
            continue
        row = existing.get(stat)
        focus = _clean_focus(prefs[stat]) if stat in prefs else (_parse_focus(row.focus) if row else [])
        level = (levels[stat].strip() if stat in levels else (row.level if row else "")) or ""
        if not focus and not level:
            if row is not None:
                db.delete(row)
        elif row is not None:
            row.focus, row.level = json.dumps(focus), level
        else:
            db.add(Preference(player_id=player.id, stat=stat, focus=json.dumps(focus), level=level))
    _clear_generated(db, player)
    db.commit()


def set_avatar(db: Session, player: Player, avatar: str) -> None:
    """Store (or clear, with "") the profile picture. Not part of /state."""
    player.avatar = avatar or ""
    db.commit()


def _owned(db: Session, model, row_id: str, player: Player):
    """Fetch a row by id only if it belongs to this player — the ownership guard
    every personal-list mutation (reminders, groceries, notes, journal) shares."""
    row = db.get(model, row_id)
    return row if row is not None and row.player_id == player.id else None


def add_reminder(db: Session, player: Player, text: str) -> None:
    text = (text or "").strip()[:200]
    if text:
        db.add(Reminder(player_id=player.id, text=text))
        db.commit()


def remove_reminder(db: Session, player: Player, reminder_id: str) -> None:
    row = _owned(db, Reminder, reminder_id, player)
    if row is not None:
        db.delete(row)
        db.commit()


def toggle_reminder(db: Session, player: Player, reminder_id: str, done: bool) -> None:
    """Check a to-do off (or back on). Done items stay in the list as a record."""
    row = _owned(db, Reminder, reminder_id, player)
    if row is not None:
        row.done = done
        row.done_at = utcnow() if done else None
        db.commit()


def add_quest_note(
    db: Session, player: Player, quest_id: str, day: str, text: str,
    prompt: str = "", step_index: int | None = None,
) -> None:
    """Save a reflection for a quest, scoped to its current period. The client sends
    one only from a 'write' step, but any note that arrives is kept. `prompt` is the
    step text being answered, stored so the Journal can show what the note responds
    to; `step_index` binds it to that step so undoing the step removes the note."""
    text = (text or "").strip()[:2000]
    if not text:
        return
    quest = next((q for q in quest_defs(db) if q.id == quest_id), None)
    if quest is None:
        raise HTTPException(404, f"Unknown quest: {quest_id}")
    pk = quests.period_key(quest.cadence, day)
    db.add(QuestNote(
        player_id=player.id, quest_id=quest_id, period_key=pk, day=day,
        text=text, prompt=(prompt or "").strip()[:500], step_index=step_index,
    ))
    db.commit()


def update_quest_note(db: Session, player: Player, note_id: str, text: str) -> None:
    """Edit an existing reflection in place (the modal editor saves through here)."""
    text = (text or "").strip()[:2000]
    row = _owned(db, QuestNote, note_id, player)
    if row is not None and text:
        row.text = text
        db.commit()


def remove_quest_note(db: Session, player: Player, note_id: str) -> None:
    row = _owned(db, QuestNote, note_id, player)
    if row is not None:
        db.delete(row)
        db.commit()


def add_journal_entry(db: Session, player: Player, day: str, text: str) -> None:
    """Write a free-form entry for the day (Markdown). Unlinked to any quest."""
    text = (text or "").strip()[:5000]
    if text:
        db.add(JournalEntry(player_id=player.id, day=day, text=text))
        db.commit()


def update_journal_entry(db: Session, player: Player, entry_id: str, text: str) -> None:
    text = (text or "").strip()[:5000]
    row = _owned(db, JournalEntry, entry_id, player)
    if row is not None and text:
        row.text = text
        row.updated_at = utcnow()  # bumps it to the top of the journal
        db.commit()


def remove_journal_entry(db: Session, player: Player, entry_id: str) -> None:
    row = _owned(db, JournalEntry, entry_id, player)
    if row is not None:
        db.delete(row)
        db.commit()


def add_grocery(db: Session, player: Player, name: str) -> None:
    name = (name or "").strip()[:120]
    if name:
        db.add(GroceryItem(player_id=player.id, name=name))
        db.commit()


def remove_grocery(db: Session, player: Player, item_id: str) -> None:
    row = _owned(db, GroceryItem, item_id, player)
    if row is not None:
        db.delete(row)
        db.commit()


def toggle_grocery(db: Session, player: Player, item_id: str, bought: bool) -> None:
    """Mark a grocery bought (or not). Bought items stay in the list as a record."""
    row = _owned(db, GroceryItem, item_id, player)
    if row is not None:
        row.bought = bought
        row.bought_at = utcnow() if bought else None
        db.commit()


# The buckets spending can be divided across. Savings is deliberately absent: it's
# the remainder of income after these two, not something you spend into.
BUDGET_BUCKETS = ("needs", "wants")


def add_money(
    db: Session,
    player: Player,
    amount: float,
    direction: str,
    note: str,
    day: str,
    bucket: str | None = None,
    commitment_id: str | None = None,
) -> None:
    """Log one money line — an amount in or out, on the given day. Amount is stored
    positive; `direction` ('in'|'out') carries the meaning.

    `bucket` tags spending against the 50/30/20 rule and only applies to money out —
    income isn't divided, it's what the division is *of*. `commitment_id` marks the
    entry as the payment of a standing commitment."""
    if amount <= 0 or direction not in ("in", "out"):
        return
    db.add(MoneyEntry(
        player_id=player.id, amount=float(amount), direction=direction,
        note=(note or "").strip()[:120], day=day,
        bucket=bucket if (direction == "out" and bucket in BUDGET_BUCKETS) else None,
        commitment_id=commitment_id,
    ))
    db.commit()


def pay_commitment(db: Session, player: Player, commitment_id: str, day: str, amount: float | None = None) -> bool:
    """Log a standing commitment as paid — one tap instead of retyping it into the
    money log. The entry carries the commitment's label, amount and bucket, so
    actuals build up on their own.

    `amount` overrides the planned figure, which is what a variable allowance like
    groceries needs. False when there's no such commitment, or it's already paid
    this month — paying twice would double-count it against the bucket."""
    row = (
        db.query(BudgetCommitment)
        .filter(BudgetCommitment.id == commitment_id, BudgetCommitment.player_id == player.id)
        .first()
    )
    if row is None or not row.active:
        return False
    if is_commitment_paid(db, player, commitment_id, day):
        return False

    paid = float(amount) if amount and amount > 0 else row.amount
    add_money(db, player, paid, "out", row.label, day, bucket=row.bucket, commitment_id=row.id)
    return True


def is_commitment_paid(db: Session, player: Player, commitment_id: str, day: str) -> bool:
    """Whether this commitment already has a payment logged in `day`'s month. The
    month is the unit because commitments recur monthly — paid in August says
    nothing about September."""
    month = day[:7]  # 'YYYY-MM'
    return (
        db.query(MoneyEntry)
        .filter(
            MoneyEntry.player_id == player.id,
            MoneyEntry.commitment_id == commitment_id,
            MoneyEntry.day.startswith(month),
        )
        .first()
        is not None
    )


def remove_money(db: Session, player: Player, entry_id: str) -> None:
    row = _owned(db, MoneyEntry, entry_id, player)
    if row is not None:
        db.delete(row)
        db.commit()


def reset_money(db: Session, player: Player) -> int:
    """A full money fresh start — one pool, so one reset clears it all: the in/out
    log, the take-home salary, and the standing budget commitments. Returns how many
    log lines were removed. Irreversible: the app guards it behind a confirm."""
    rows = db.query(MoneyEntry).filter(MoneyEntry.player_id == player.id).all()
    for row in rows:
        db.delete(row)
    for commitment in db.query(BudgetCommitment).filter(BudgetCommitment.player_id == player.id).all():
        db.delete(commitment)
    player.monthly_income = 0
    player.budget_start_month = ""
    db.commit()
    return len(rows)


# ── Budget: monthly income and the standing commitments it's divided across ───


def set_monthly_income(db: Session, player: Player, income: float, day: str) -> None:
    """Store take-home pay per payday. Deliberately *only* a setting: nothing is
    logged and no balance moves — money exists in this app only once it actually
    lands, via the payday money-in the user logs. The first time it's set we stamp
    the month the budget began, so spending logged before there was a budget is
    never judged against it."""
    player.monthly_income = max(0.0, round(income, 2))
    if player.monthly_income > 0 and not player.budget_start_month:
        player.budget_start_month = day[:7]  # 'YYYY-MM'
    db.commit()


def add_commitment(
    db: Session,
    player: Player,
    label: str,
    amount: float,
    bucket: str,
    due_day: int = 0,
    variable: bool = False,
) -> BudgetCommitment | None:
    """Add a standing monthly commitment — a bill or a planned allowance. Returns the
    row, or None when the label is blank or the bucket isn't one we divide across."""
    label = (label or "").strip()[:60]
    if not label or bucket not in BUDGET_BUCKETS or amount <= 0:
        return None
    row = BudgetCommitment(
        player_id=player.id,
        label=label,
        amount=round(amount, 2),
        bucket=bucket,
        due_day=due_day if 1 <= due_day <= 31 else 0,
        variable=variable,
    )
    db.add(row)
    db.commit()
    return row


def update_commitment(
    db: Session,
    player: Player,
    commitment_id: str,
    label: str | None = None,
    amount: float | None = None,
    bucket: str | None = None,
    due_day: int | None = None,
    variable: bool | None = None,
    active: bool | None = None,
) -> bool:
    """Edit one commitment in place. Only the fields passed are touched, so the app
    can flip `active` without resending the whole row. False when there's no match."""
    row = (
        db.query(BudgetCommitment)
        .filter(BudgetCommitment.id == commitment_id, BudgetCommitment.player_id == player.id)
        .first()
    )
    if row is None:
        return False
    if label is not None and label.strip():
        row.label = label.strip()[:60]
    if amount is not None and amount > 0:
        row.amount = round(amount, 2)
    if bucket in BUDGET_BUCKETS:
        row.bucket = bucket
    if due_day is not None:
        row.due_day = due_day if 1 <= due_day <= 31 else 0
    if variable is not None:
        row.variable = variable
    if active is not None:
        row.active = active
    db.commit()
    return True


def remove_commitment(db: Session, player: Player, commitment_id: str) -> None:
    row = (
        db.query(BudgetCommitment)
        .filter(BudgetCommitment.id == commitment_id, BudgetCommitment.player_id == player.id)
        .first()
    )
    if row is not None:
        db.delete(row)
        db.commit()


def _load_priorities(player: Player) -> dict:
    try:
        data = json.loads(player.priorities or "{}")
        return data if isinstance(data, dict) else {}
    except (ValueError, TypeError):
        return {}


def set_priority(db: Session, player: Player, stat: str, focus: str, scope: str, day: str) -> None:
    """Pin a priority for one attribute, on top of that category's plan. `scope` is
    'day' | 'week' | 'open'; the period stamps when it was set so day/week
    priorities expire on their own. Setting a stat again replaces its priority."""
    focus = (focus or "").strip()[:60]
    if stat not in game.STAT_KEYS or not focus:
        return
    if scope not in ("day", "week", "open"):
        scope = "week"
    period = day if scope == "day" else (game.week_key(day) if scope == "week" else "")
    data = _load_priorities(player)
    data[stat] = {"focus": focus, "scope": scope, "period": period}
    player.priorities = json.dumps(data)
    db.commit()


def clear_priority(db: Session, player: Player, stat: str) -> None:
    data = _load_priorities(player)
    if data.pop(stat, None) is not None:
        player.priorities = json.dumps(data)
        db.commit()


def reset_all(db: Session, player: Player) -> None:
    db.query(Completion).filter_by(player_id=player.id).delete()
    db.query(AchievementUnlock).filter_by(player_id=player.id).delete()
    db.query(StepCheck).filter_by(player_id=player.id).delete()
    _clear_generated(db, player)
    player.equipped_title = None
    player.created_at = utcnow()
    player.progression_start_week = ""  # re-anchor: progression restarts from zero
    db.commit()
