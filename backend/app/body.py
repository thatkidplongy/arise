"""The 'Body' tools: nutrition (calorie/protein) and skincare.

Deliberately standalone — these don't touch stats, XP, streaks or quests. It's a
self-contained subsystem: reads *derive* (targets from the profile, totals from
the log, done-flags from the checks) and writes are small and forgiving. The food
tracker never has a 'failed' state; skincare is a plain daily checklist.
"""

from datetime import date, timedelta

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


def _entry(r: FoodEntry) -> dict:
    """One logged plate, as the app reads it."""
    row = {
        "id": r.id, "name": r.name, "slot": r.slot or "", "place": r.place or "",
        "at_time": r.at_time or "",
        "protein_p": r.protein_p, "veg_p": r.veg_p, "carb_p": r.carb_p,
        "extra_p": r.extra_p,
        "grams": r.grams, "kcal": r.kcal, "protein_g": r.protein_g,
        "fibre_g": r.fibre_g,
        "source": r.source or "",
    }
    # The row's own range, from the same table the week is built from — so a
    # plate never shows one figure here and a different one in the trend. A
    # label-read row (grams known) comes back tight; a plate of hands comes back
    # wide, which is the honest difference the screen is meant to show.
    low, high = nutrition.estimate([row], "kcal")
    return {**row, "kcal_low": low, "kcal_high": high}


def _rows_for(db: Session, player_id: str, days: list[str]) -> list[FoodEntry]:
    return (
        db.query(FoodEntry)
        .filter(FoodEntry.player_id == player_id, FoodEntry.day.in_(days))
        .order_by(FoodEntry.day, FoodEntry.at)
        .all()
    )


def _food_day(db: Session, player_id: str, day: str, targets: dict | None = None) -> dict:
    """The day's plates, what they added up to in hands, and the day's own range.

    The range is a *range*, never a point: a single day's estimate off bought food
    carries an error of a few hundred kcal, and a bare figure that wrong is a score
    people learn to game. Shown as a span against the band it is the comparison
    that was always meant — and it is the same estimate the week is built from
    (see `_food_week`), so the two can never disagree."""
    entries = [_entry(r) for r in _rows_for(db, player_id, [day])]
    low, high = nutrition.estimate(entries, "kcal")
    band_low = targets["target_low"] if targets else 0
    band_high = targets["target_high"] if targets else 0
    return {
        "entries": entries,
        "plate": nutrition.plate_totals(entries),
        # Only what was logged with real numbers — a packaged label, a database
        # lookup. Zero on a day logged entirely in hands, which is the normal case.
        "total_kcal": sum(e["kcal"] for e in entries),
        "total_protein": sum(e["protein_g"] for e in entries),
        "total_fibre": sum(e["fibre_g"] for e in entries),
        "kcal_low": low,
        "kcal_high": high,
        # Overlapping the band is the honest test: a range that spans it cannot be
        # called a miss in either direction.
        "in_band": bool(entries and band_high and low <= band_high and high >= band_low),
        "band_low": band_low,
        "band_high": band_high,
    }


def _week_days(day: str) -> list[str]:
    """`day` and the six before it — a rolling week, so the trend is always seven
    days deep rather than one day long every Monday morning."""
    end = date.fromisoformat(day)
    return [(end - timedelta(days=n)).isoformat() for n in range(6, -1, -1)]


def _food_week(db: Session, player_id: str, day: str, targets: dict | None) -> dict:
    """The seven days behind `day` as a calorie range against the hunter's band.

    The week's range is estimated from every portion at once and then divided by
    the days logged, rather than averaging seven separate day-ranges: independent
    errors cancel across a week, which is the whole reason this figure is shown
    weekly and not daily."""
    days = _week_days(day)
    by_day: dict[str, list[dict]] = {d: [] for d in days}
    for r in _rows_for(db, player_id, days):
        by_day[r.day].append(_entry(r))

    band_low = targets["target_low"] if targets else 0
    band_high = targets["target_high"] if targets else 0

    out_days = []
    for d in days:
        entries = by_day[d]
        low, high = nutrition.estimate(entries, "kcal")
        out_days.append({
            "day": d,
            "logged": len(entries),
            "kcal_low": low,
            "kcal_high": high,
            # Overlapping the band is the honest test: an estimate that spans it
            # cannot be called a miss, in either direction.
            "in_band": bool(entries and band_high and low <= band_high and high >= band_low),
            **nutrition.plate_totals(entries),
        })

    logged_days = sum(1 for d in out_days if d["logged"])
    everything = [e for d in days for e in by_day[d]]
    week = nutrition.per_day(nutrition.day_estimate(everything), logged_days)
    return {
        "days": out_days,
        "logged_days": logged_days,
        "in_band_days": sum(1 for d in out_days if d["in_band"]),
        "band_low": band_low,
        "band_high": band_high,
        **week,
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


# How far back a plate still counts as one of your usuals. Long enough that a
# place you eat at monthly survives; short enough that last year's canteen doesn't.
USUALS_WINDOW_DAYS = 60


def _usuals(db: Session, player_id: str, day: str) -> list[dict]:
    """The plates worth one tap — what's been logged before, most-repeated first."""
    since = (date.fromisoformat(day) - timedelta(days=USUALS_WINDOW_DAYS)).isoformat()
    rows = (
        db.query(FoodEntry)
        .filter(FoodEntry.player_id == player_id, FoodEntry.day >= since,
                FoodEntry.day <= day)
        .order_by(FoodEntry.at)
        .all()
    )
    return nutrition.usuals([_entry(r) for r in rows])


def build_body(db: Session, player_id: str, day: str) -> dict:
    """The whole Body payload for a day (see schemas.BodyOut)."""
    seed_skincare_if_empty(db, player_id)
    p = _profile_row(db, player_id)
    am, pm = _skincare(db, player_id, day)
    sc = skincare_stats(db, player_id, day)
    targets = _targets(p)
    return {
        "day": day,
        "profile": (
            None if p is None else {
                "sex": p.sex, "age": p.age, "height_cm": p.height_cm,
                "weight_kg": p.weight_kg, "activity": p.activity, "goal": p.goal,
                "goal_weight_kg": p.goal_weight_kg, "country": p.country,
            }
        ),
        "targets": targets,
        # The day in hands, and the same day's plan in hands. One module owns the
        # conversion (nutrition.plate_targets) so the screen and the Fuel quest
        # can never disagree about how many palms today is asking for.
        "plate_targets": nutrition.plate_targets(targets) or None,
        "food": _food_day(db, player_id, day, targets),
        "usuals": _usuals(db, player_id, day),
        "week": _food_week(db, player_id, day, targets),
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


# What a plate can be called. Anything else is stored as a plain plate with no slot.
_SLOTS = {"breakfast", "lunch", "dinner", "snack"}
# Where a plate's figures came from. '' is the default and means hand-counted —
# an absent claim rather than a claim of having been measured.
_SOURCES = {"claude", "photo", "label"}

# A hand can't reasonably be raised more times than this for one plate; a stray
# extra zero would otherwise put a day's tally somewhere it can never come back from.
MAX_PORTIONS = 12


def _clamp_portion(n: int) -> int:
    return max(0, min(MAX_PORTIONS, int(n or 0)))


def log_food(db: Session, player_id: str, day: str, name: str, grams: int = 0,
             kcal: int = 0, protein_g: int = 0, fibre_g: int = 0, *,
             slot: str = "", place: str = "", at_time: str = "",
             protein_p: int = 0, veg_p: int = 0, carb_p: int = 0,
             extra_p: int = 0, source: str = "") -> dict:
    """Log one plate. Portions are the normal case; the gram/calorie figures are
    only filled in when the food actually came with numbers."""
    name = (name or "").strip() or "Food"
    named_slot = (slot or "").strip().lower()
    entry = FoodEntry(
        id=new_id(), player_id=player_id, day=day, name=name[:80],
        slot=named_slot if named_slot in _SLOTS else "",
        place=(place or "").strip()[:60],
        at_time=(at_time or "").strip()[:5],
        protein_p=_clamp_portion(protein_p), veg_p=_clamp_portion(veg_p),
        carb_p=_clamp_portion(carb_p), extra_p=_clamp_portion(extra_p),
        grams=max(0, grams), kcal=max(0, kcal), protein_g=max(0, protein_g),
        fibre_g=max(0, fibre_g),
        source=source if source in _SOURCES else "",
    )
    db.add(entry)
    db.commit()
    return _entry(entry)


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
