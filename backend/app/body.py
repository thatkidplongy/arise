"""The 'Body' tools: nutrition (calorie/protein) and skincare.

Deliberately standalone — these don't touch stats, XP, streaks or quests. It's a
self-contained subsystem: reads *derive* (targets from the profile, totals from
the log, done-flags from the checks) and writes are small and forgiving. The food
tracker never has a 'failed' state; skincare is a plain daily checklist.
"""

from sqlalchemy.orm import Session

from . import game, nutrition, skincare
from .models import BodyProfile, FoodEntry, SkincareCheck, SkincareStep, new_id

_SEX = {"male", "female", "unspecified"}

# Doing your routine is self-care → it feeds Spirit (SPI) and builds a gentle
# consistency streak. XP per fully-completed routine block (AM or PM) on a day.
SKINCARE_BLOCK_XP = 5


# ── Reads ─────────────────────────────────────────────────────────────────────


def _profile_row(db: Session, player_id: str) -> BodyProfile | None:
    return db.get(BodyProfile, player_id)


def _targets(p: BodyProfile | None) -> dict | None:
    """A calorie/protein target only makes sense once the numbers are real."""
    if p is None or p.age <= 0 or p.height_cm <= 0 or p.weight_kg <= 0:
        return None
    return nutrition.targets(
        p.sex, p.age, p.height_cm, p.weight_kg, p.activity, p.goal, p.goal_weight_kg
    )


def targets_of(db: Session, player_id: str) -> dict | None:
    """The current nutrition targets, or None until the profile has real numbers.
    The Fuel quest's floor is written from these (see quests.fuel_floor)."""
    return _targets(_profile_row(db, player_id))


def _food_day(db: Session, player_id: str, day: str) -> dict:
    rows = (
        db.query(FoodEntry)
        .filter_by(player_id=player_id, day=day)
        .order_by(FoodEntry.at)
        .all()
    )
    entries = [
        {"id": r.id, "name": r.name, "grams": r.grams, "kcal": r.kcal,
         "protein_g": r.protein_g, "fibre_g": r.fibre_g}
        for r in rows
    ]
    return {
        "entries": entries,
        "total_kcal": sum(r.kcal for r in rows),
        "total_protein": sum(r.protein_g for r in rows),
        "total_fibre": sum(r.fibre_g for r in rows),
    }


def seed_skincare_if_empty(db: Session, player_id: str) -> None:
    """Give a new player the template routine, once. Idempotent: only seeds when
    they have no steps at all (so removing every step doesn't re-seed)."""
    exists = db.query(SkincareStep).filter_by(player_id=player_id).first()
    if exists is not None:
        return
    for sort, (routine, text) in enumerate(skincare.TEMPLATE):
        db.add(SkincareStep(id=new_id(), player_id=player_id, routine=routine, text=text, sort=sort))
    db.commit()


def _skincare(db: Session, player_id: str, day: str) -> tuple[list[dict], list[dict]]:
    steps = (
        db.query(SkincareStep)
        .filter_by(player_id=player_id, active=True)
        .order_by(SkincareStep.sort, SkincareStep.id)
        .all()
    )
    checked = {
        c.step_id
        for c in db.query(SkincareCheck).filter_by(player_id=player_id, day=day)
    }
    am, pm = [], []
    for s in steps:
        out = {"id": s.id, "routine": s.routine, "text": s.text, "done": s.id in checked}
        (am if s.routine == "AM" else pm).append(out)
    return am, pm


def _skincare_done_blocks(db: Session, player_id: str) -> dict[str, set[str]]:
    """{day: routine blocks ('AM'/'PM') fully completed that day}, judged against
    the currently-active steps. A block counts only when it has steps and every
    one of them is ticked for that day."""
    block_ids: dict[str, set[str]] = {"AM": set(), "PM": set()}
    for s in db.query(SkincareStep).filter_by(player_id=player_id, active=True):
        block_ids["AM" if s.routine == "AM" else "PM"].add(s.id)
    checks_by_day: dict[str, set[str]] = {}
    for c in db.query(SkincareCheck).filter_by(player_id=player_id):
        checks_by_day.setdefault(c.day, set()).add(c.step_id)
    out: dict[str, set[str]] = {}
    for day, ticked in checks_by_day.items():
        done = {b for b, ids in block_ids.items() if ids and ids <= ticked}
        if done:
            out[day] = done
    return out


def skincare_stats(db: Session, player_id: str, day: str) -> dict:
    """Self-care as Spirit: XP from every completed routine block (all history),
    and a gentle consistency streak of days a block was done. Derive-on-read."""
    blocks = _skincare_done_blocks(db, player_id)
    return {
        "xp": sum(len(b) for b in blocks.values()) * SKINCARE_BLOCK_XP,
        "streak": game.current_streak(set(blocks.keys()), day),
        "days": len(blocks),
    }


def build_body(db: Session, player_id: str, day: str) -> dict:
    """The whole Body payload for a day (see schemas.BodyOut)."""
    seed_skincare_if_empty(db, player_id)
    p = _profile_row(db, player_id)
    am, pm = _skincare(db, player_id, day)
    sc = skincare_stats(db, player_id, day)
    return {
        "day": day,
        "profile": (
            None if p is None else {
                "sex": p.sex, "age": p.age, "height_cm": p.height_cm,
                "weight_kg": p.weight_kg, "activity": p.activity, "goal": p.goal,
                "goal_weight_kg": p.goal_weight_kg, "country": p.country,
            }
        ),
        "targets": _targets(p),
        "food": _food_day(db, player_id, day),
        "suggestions": nutrition.daily_suggestions(day, p.country if p else ""),
        "skincare_am": am,
        "skincare_pm": pm,
        "skincare_products": skincare.product_suggestions(p.country if p else ""),
        "skincare_resources": skincare.RESOURCES,
        "skincare_note": skincare.NOTE,
        "skincare_streak": sc["streak"],
        "skincare_days": sc["days"],
    }


# ── Writes ──────────────────────────────────────────────────────────────────────


def set_profile(db: Session, player_id: str, *, sex: str, age: int, height_cm: int,
                weight_kg: float, activity: str, goal: str, goal_weight_kg: float = 0,
                country: str = "") -> None:
    sex = sex if sex in _SEX else "unspecified"
    activity = activity if activity in nutrition.ACTIVITY_FACTORS else "moderate"
    goal = goal if goal in nutrition.GOALS else "maintain"
    row = db.get(BodyProfile, player_id)
    if row is None:
        row = BodyProfile(player_id=player_id)
        db.add(row)
    row.sex, row.age, row.height_cm = sex, max(0, age), max(0, height_cm)
    row.weight_kg, row.activity, row.goal = max(0.0, float(weight_kg)), activity, goal
    row.goal_weight_kg = max(0.0, float(goal_weight_kg))
    row.country = (country or "").strip().upper()[:2]  # ISO-ish code; "" = worldwide
    db.commit()


def log_food(db: Session, player_id: str, day: str, name: str, grams: int,
             kcal: int, protein_g: int, fibre_g: int = 0) -> dict:
    name = (name or "").strip() or "Food"
    entry = FoodEntry(
        id=new_id(), player_id=player_id, day=day, name=name[:80],
        grams=max(0, grams), kcal=max(0, kcal), protein_g=max(0, protein_g),
        fibre_g=max(0, fibre_g),
    )
    db.add(entry)
    db.commit()
    return {"id": entry.id, "name": entry.name, "grams": entry.grams,
            "kcal": entry.kcal, "protein_g": entry.protein_g, "fibre_g": entry.fibre_g}


def remove_food(db: Session, player_id: str, entry_id: str) -> bool:
    row = db.get(FoodEntry, entry_id)
    if row is None or row.player_id != player_id:
        return False
    db.delete(row)
    db.commit()
    return True


def add_skincare_step(db: Session, player_id: str, routine: str, text: str) -> None:
    routine = "PM" if str(routine).upper() == "PM" else "AM"
    text = (text or "").strip()
    if not text:
        return
    last = (
        db.query(SkincareStep)
        .filter_by(player_id=player_id, routine=routine)
        .order_by(SkincareStep.sort.desc())
        .first()
    )
    db.add(SkincareStep(
        id=new_id(), player_id=player_id, routine=routine, text=text[:120],
        sort=(last.sort + 1 if last else 0),
    ))
    db.commit()


def remove_skincare_step(db: Session, player_id: str, step_id: str) -> bool:
    row = db.get(SkincareStep, step_id)
    if row is None or row.player_id != player_id:
        return False
    row.active = False  # keep the row so past ticks stay coherent
    db.commit()
    return True


def toggle_skincare(db: Session, player_id: str, step_id: str, done: bool, day: str) -> None:
    key = {"player_id": player_id, "step_id": step_id, "day": day}
    existing = db.get(SkincareCheck, key)
    if done and existing is None:
        db.add(SkincareCheck(**key))
    elif not done and existing is not None:
        db.delete(existing)
    db.commit()
