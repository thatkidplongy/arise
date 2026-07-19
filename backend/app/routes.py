from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from . import body, books, insights, llm, nutrition, service, skincare, state, transcript
from .db import get_db
from .schemas import (ActionResult, AvatarIn, AvatarOut, BodyOut, BodyProfileIn,
                      BookIn, BookReviewIn, BookOut, BookShelfOut, CompleteIn,
                      FoodAnalyzeIn, FoodEstimateOut, FoodLogIn, FoodSearchItemOut,
                      InsightAddIn, InsightOut, InterviewModeIn, PlayerIn,
                      PreferencesIn, ReminderIn, ReminderToggleIn, SkincareCheckIn,
                      SkincareProductOut, SkincareStepIn, StateOut, StepResult, StepToggleIn)

router = APIRouter()


def _valid_day(day: str | None) -> str:
    if day is None:
        return date.today().isoformat()
    try:
        date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "day must be YYYY-MM-DD")
    return day


def _external_lookup(db: Session, fn, unavailable: str):
    """Shared shape for the free-API lookups (books, food, skincare): ensure a
    player exists, run the search, and turn any transport/parse failure into a
    clean 502 rather than a bare 500."""
    state.get_or_create_player(db)
    try:
        return fn()
    except Exception:
        raise HTTPException(502, unavailable)


@router.get("/state", response_model=StateOut)
def get_state(
    day: str | None = Query(None, description="Client-local date, YYYY-MM-DD"),
    db: Session = Depends(get_db),
):
    """Everything the app needs to render, in one shot."""
    player = state.get_or_create_player(db)
    return state.build_state(db, player, _valid_day(day))


@router.post("/completions", response_model=ActionResult)
def complete_quest(body: CompleteIn, db: Session = Depends(get_db)):
    """Complete a quest. Returns System events (level up, rank up, achievements...)
    plus the fresh state."""
    player = state.get_or_create_player(db)
    return service.complete_quest(db, player, body.quest_id, _valid_day(body.day))


@router.post("/steps", response_model=StepResult)
def toggle_step(body: StepToggleIn, db: Session = Depends(get_db)):
    """Tick/untick one step of a quest. Ticking the last step auto-completes it
    (see `completed` in the response); unticking a step of a done quest undoes it."""
    player = state.get_or_create_player(db)
    return service.toggle_step(db, player, body.quest_id, body.step_index, _valid_day(body.day))


@router.delete("/completions/{completion_id}", response_model=ActionResult)
def undo_completion(
    completion_id: str,
    day: str | None = Query(None, description="Client-local date, for the returned state"),
    db: Session = Depends(get_db),
):
    player = state.get_or_create_player(db)
    return service.undo_completion(db, player, completion_id, _valid_day(day))


@router.put("/player", response_model=StateOut)
def update_player(
    body: PlayerIn,
    day: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Update hunter name, equipped title, and/or North Star. Send equipped_title:
    null to unequip; send north_star: "" to clear it."""
    player = state.get_or_create_player(db)
    service.update_player(
        db,
        player,
        name=body.name,
        title_provided="equipped_title" in body.model_fields_set,
        equipped_title=body.equipped_title,
        north_star_provided="north_star" in body.model_fields_set,
        north_star=body.north_star,
    )
    return state.build_state(db, player, _valid_day(day))


@router.post("/rest", response_model=StateOut)
def toggle_rest(day: str | None = Query(None), db: Session = Depends(get_db)):
    """Toggle today's rest day. Rest keeps your streak — it's part of the path."""
    player = state.get_or_create_player(db)
    service.toggle_rest_day(db, player, _valid_day(day))
    return state.build_state(db, player, _valid_day(day))


@router.put("/preferences", response_model=StateOut)
def update_preferences(
    body: PreferencesIn,
    day: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Set a focus and/or a "where I'm at" level per attribute
    (STR/CRE/SPI/CHA/INT/WLT). A set focus themes that attribute's side quest;
    the level feeds LLM sequencing when enabled."""
    player = state.get_or_create_player(db)
    service.update_preferences(db, player, body.preferences, body.levels)
    return state.build_state(db, player, _valid_day(day))


@router.post("/quests/generate", response_model=StateOut)
def generate_quests(day: str | None = Query(None), db: Session = Depends(get_db)):
    """Personalise this period's quests with the LLM (if a key is configured),
    caching the result. Safe to call any time: a no-op when the LLM is off or the
    period is already generated, and it falls back to the pools on any failure."""
    player = state.get_or_create_player(db)
    return service.generate_quests(db, player, _valid_day(day))


@router.put("/book", response_model=StateOut)
def set_book(body: BookIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Set or change the book you're currently reading. Send "" to clear it.
    Optional `chapters` sets the reading pace (a longer book asks more per day)."""
    player = state.get_or_create_player(db)
    service.set_book(db, player, body.current_book, _valid_day(day), body.chapters)
    return state.build_state(db, player, _valid_day(day))


@router.get("/books/search", response_model=list[BookOut])
def books_search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Search Open Library for a book to set as your current read (free, no key)."""
    return _external_lookup(db, lambda: books.search(q),
                            "Book search is unavailable right now — try again, or type the title.")


@router.get("/books/suggest", response_model=list[BookShelfOut])
def books_suggest(db: Session = Depends(get_db)):
    """A few themed reading shelves (Grow / Money / Craft / Calm) from Open Library."""
    state.get_or_create_player(db)
    try:
        return books.suggestions()
    except Exception:
        return []  # suggestions are a nicety — never an error


@router.post("/book/review", response_model=StateOut)
def review_book(body: BookReviewIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Answer the weekly reading review: finished → counts it and rolls to
    next_book; not yet → keeps the current book. Asked once per new week."""
    player = state.get_or_create_player(db)
    service.review_book(db, player, body.finished, body.next_book, _valid_day(day))
    return state.build_state(db, player, _valid_day(day))


@router.put("/interview", response_model=StateOut)
def set_interview_mode(body: InterviewModeIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Toggle Craft's interview-prep mode. On → the coding attribute's quests shift
    to timed DSA, mock system design, and behavioural stories; off → steady growth."""
    player = state.get_or_create_player(db)
    service.set_interview_mode(db, player, body.enabled)
    return state.build_state(db, player, _valid_day(day))


@router.post("/reset", response_model=StateOut)
def reset(day: str | None = Query(None), db: Session = Depends(get_db)):
    """Erase all progress (completions + achievements). Name is kept."""
    player = state.get_or_create_player(db)
    service.reset_all(db, player)
    return state.build_state(db, player, _valid_day(day))


# ── Body: nutrition + skincare (standalone wellness tools) ────────────────────


@router.get("/body", response_model=BodyOut)
def get_body(day: str | None = Query(None), db: Session = Depends(get_db)):
    """Everything the Body screen needs: calorie/protein targets, the day's food
    log with totals, and the AM/PM skincare routine with today's ticks."""
    player = state.get_or_create_player(db)
    return body.build_body(db, player.id, _valid_day(day))


@router.put("/body/profile", response_model=BodyOut)
def set_body_profile(profile: BodyProfileIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Set the one-time body inputs; targets are recomputed on read."""
    player = state.get_or_create_player(db)
    body.set_profile(
        db, player.id, sex=profile.sex, age=profile.age, height_cm=profile.height_cm,
        weight_kg=profile.weight_kg, activity=profile.activity, goal=profile.goal,
        goal_weight_kg=profile.goal_weight_kg, country=profile.country,
    )
    return body.build_body(db, player.id, _valid_day(day))


@router.get("/food/search", response_model=list[FoodSearchItemOut])
def food_search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Look a food up in Open Food Facts (per-100 g values). The client picks one
    and logs the grams eaten. A lookup failure is a clean 502, not a crash."""
    return _external_lookup(db, lambda: nutrition.search(q),
                            "Food lookup is unavailable right now — try again, or log it by hand.")


@router.post("/food/analyze", response_model=FoodEstimateOut)
def analyze_food(shot: FoodAnalyzeIn, db: Session = Depends(get_db)):
    """Estimate a meal's calories/protein/fibre from a photo (Gemini vision). The
    estimate is returned for the user to review and edit — it is NOT logged here.
    Needs a Gemini key; a rough estimate by nature, never a precise measurement."""
    state.get_or_create_player(db)
    if not llm.enabled():
        raise HTTPException(503, "Photo estimate needs a Gemini key (set ARISE_LLM_API_KEY).")
    if not shot.image.strip():
        raise HTTPException(400, "No image provided.")
    try:
        return llm.analyze_food(shot.image, shot.mime)
    except Exception:
        raise HTTPException(502, "Couldn't read that photo — try another shot, or log it by hand.")


@router.post("/food/log", response_model=BodyOut)
def log_food(entry: FoodLogIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Add one food to the day's log."""
    player = state.get_or_create_player(db)
    body.log_food(db, player.id, _valid_day(day), entry.name, entry.grams,
                  entry.kcal, entry.protein_g, entry.fibre_g)
    return body.build_body(db, player.id, _valid_day(day))


@router.delete("/food/log/{entry_id}", response_model=BodyOut)
def remove_food(entry_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    body.remove_food(db, player.id, entry_id)
    return body.build_body(db, player.id, _valid_day(day))


@router.get("/skincare/search", response_model=list[SkincareProductOut])
def skincare_search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """Look a product up in Open Beauty Facts (free, no key) and read its
    ingredients, flagging the actives that help pigmentation & pores. A gentle
    guide, not medical advice. A lookup failure is a clean 502, not a crash."""
    return _external_lookup(db, lambda: skincare.lookup(q),
                            "Ingredient lookup is unavailable right now — try again in a bit.")


@router.post("/skincare/step", response_model=BodyOut)
def add_skincare_step(step: SkincareStepIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Append a step to your AM or PM routine."""
    player = state.get_or_create_player(db)
    body.add_skincare_step(db, player.id, step.routine, step.text)
    return body.build_body(db, player.id, _valid_day(day))


@router.delete("/skincare/step/{step_id}", response_model=BodyOut)
def remove_skincare_step(step_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    body.remove_skincare_step(db, player.id, step_id)
    return body.build_body(db, player.id, _valid_day(day))


@router.post("/skincare/check", response_model=BodyOut)
def check_skincare(body_in: SkincareCheckIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Tick or untick one skincare step for the day."""
    player = state.get_or_create_player(db)
    body.toggle_skincare(db, player.id, body_in.step_id, body_in.done, _valid_day(day))
    return body.build_body(db, player.id, _valid_day(day))


# ── Inspire: capture a motivational video → distilled insight ─────────────────


@router.get("/insights", response_model=list[InsightOut])
def list_insights(db: Session = Depends(get_db)):
    """Every captured video, newest first, with its distilled takeaways + quotes."""
    player = state.get_or_create_player(db)
    return insights.list_insights(db, player.id)


@router.post("/insights", response_model=InsightOut)
def add_insight(body_in: InsightAddIn, db: Session = Depends(get_db)):
    """Capture a video: fetch its spoken transcript (Supadata) and distil it (Gemini)
    into takeaways + pull-quotes. Needs a Supadata key; distilling needs the Gemini key.
    A rough, editable capture by nature — never logged silently anywhere else."""
    player = state.get_or_create_player(db)
    if not transcript.enabled():
        raise HTTPException(503, "Capturing videos needs a Supadata key (set ARISE_SUPADATA_API_KEY).")
    if not llm.enabled():
        raise HTTPException(503, "Distilling needs a Gemini key (set ARISE_LLM_API_KEY).")
    try:
        return insights.add_insight(db, player.id, body_in.url)
    except insights.NoTranscript:
        raise HTTPException(422, "No speech found in that video — it may be music- or text-only.")
    except Exception:
        raise HTTPException(502, "Couldn't fetch that transcript — check the link, or try another.")


@router.delete("/insights/{insight_id}", response_model=list[InsightOut])
def remove_insight(insight_id: str, db: Session = Depends(get_db)):
    """Forget a capture. Returns the remaining list."""
    player = state.get_or_create_player(db)
    insights.remove_insight(db, player.id, insight_id)
    return insights.list_insights(db, player.id)


# ── Profile avatar (kept out of /state; fetched on demand) ────────────────────


@router.get("/player/avatar", response_model=AvatarOut)
def get_avatar(db: Session = Depends(get_db)):
    """The profile picture as a data URI, or "" when none is set."""
    player = state.get_or_create_player(db)
    return {"avatar": player.avatar or ""}


@router.put("/player/avatar", response_model=AvatarOut)
def put_avatar(body_in: AvatarIn, db: Session = Depends(get_db)):
    """Set (or clear, with "") the profile picture — a small image data URI."""
    player = state.get_or_create_player(db)
    av = (body_in.avatar or "").strip()
    if av and not av.startswith("data:image/"):
        raise HTTPException(400, "Avatar must be an image data URI.")
    if len(av) > 700_000:  # ~500 KB image; keep the database lean
        raise HTTPException(413, "That image is too large — pick a smaller one.")
    service.set_avatar(db, player, av)
    return {"avatar": av}


# ── Reminders (a simple personal list; no scheduling) ─────────────────────────


@router.post("/reminders", response_model=StateOut)
def add_reminder(body_in: ReminderIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Jot a plain reminder. It shows as a simple list on Status."""
    player = state.get_or_create_player(db)
    service.add_reminder(db, player, body_in.text)
    return state.build_state(db, player, _valid_day(day))


@router.post("/reminders/{reminder_id}/toggle", response_model=StateOut)
def toggle_reminder(reminder_id: str, body_in: ReminderToggleIn,
                    day: str | None = Query(None), db: Session = Depends(get_db)):
    """Check a to-do off (or back on). Done items stay in the list."""
    player = state.get_or_create_player(db)
    service.toggle_reminder(db, player, reminder_id, body_in.done)
    return state.build_state(db, player, _valid_day(day))


@router.delete("/reminders/{reminder_id}", response_model=StateOut)
def remove_reminder(reminder_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    service.remove_reminder(db, player, reminder_id)
    return state.build_state(db, player, _valid_day(day))
