from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from . import (body, books, digest, insights, llm, mailer, nutrition, service, skincare,
               state, transcript)
from .db import get_db
from .schemas import (ActionResult, AvatarIn, AvatarOut, BodyOut, BodyProfileIn,
                      BookIn, BookReviewIn, BookOut, BookShelfOut, CommitmentIn, CraftPhaseIn, CraftPieceIn, CraftSourceIn,
                      CommitmentPatch, CompleteIn, DigestOut, DigestSendOut,
                      FoodAnalyzeIn, FoodEstimateOut, FoodLogIn, FoodSearchItemOut,
                      GroceryIn, GroceryToggleIn, HistoryItemOut, IncomeIn, InsightAddIn,
                      InsightOut, InterviewModeIn, JournalEntryIn, JournalEntryUpdateIn,
                      LearningIn, LearningOut, RecallEditIn, RecallGradeIn, RecallOut,
                      MoneyIn, MoneyHistoryOut, PayCommitmentIn, PriorityIn,
                      PlayerIn, PreferencesIn, QuestNoteIn, QuestNoteUpdateIn,
                      ReadingLogIn, ReminderIn, ReminderToggleIn, SkincareCheckIn,
                      SkincareProductOut, SkincareStepIn, StateOut, StepResult,
                      StepToggleIn)

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


@router.get("/history", response_model=list[HistoryItemOut])
def quest_history(db: Session = Depends(get_db)):
    """A dated log of finished quests, newest first — for the You → History screen."""
    player = state.get_or_create_player(db)
    return state.history_of(db, player)


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
    Optional `chapters` is the book's length — the finish line your logged chapters
    are measured against, not a per-day target."""
    player = state.get_or_create_player(db)
    service.set_book(db, player, body.current_book, _valid_day(day), body.chapters)
    return state.build_state(db, player, _valid_day(day))


@router.post("/reading/log", response_model=StateOut)
def log_reading(body: ReadingLogIn, db: Session = Depends(get_db)):
    """Log what you actually read today — which chapters, and how many. Progress on
    the book comes entirely from these, so nothing here is a quota you can miss.
    Log as many sittings in a day as you like; they add up."""
    player = state.get_or_create_player(db)
    if not player.current_book:
        raise HTTPException(400, "Set the book you're reading first (Status → Current book).")
    day = _valid_day(body.day)
    service.log_reading(db, player, day, body.chapters, body.label)
    return state.build_state(db, player, day)


@router.delete("/reading/log/{log_id}", response_model=StateOut)
def remove_reading_log(log_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Take back a logged sitting."""
    player = state.get_or_create_player(db)
    service.remove_reading_log(db, player, log_id)
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


@router.post("/book/review", response_model=ActionResult)
def review_book(body: BookReviewIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Answer the weekly reading review: finished → counts it and rolls to
    next_book; not yet → keeps the current book. Asked once per new week.

    Returns events as well as state: finishing a book can unlock an achievement, and
    the answer to "did you finish it?" is the moment to say so."""
    player = state.get_or_create_player(db)
    d = _valid_day(day)
    events = service.review_book(db, player, body.finished, body.next_book, d)
    return {"events": events, "state": state.build_state(db, player, d)}


@router.put("/craft/source", response_model=StateOut)
def set_craft_source(body: CraftSourceIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Set the one thing you're studying for Craft — the chapter or Notion page open in
    front of you. The daily names this and nothing else; send "" to clear it."""
    player = state.get_or_create_player(db)
    service.set_craft_source(db, player, body.source)
    return state.build_state(db, player, _valid_day(day))


@router.post("/craft/piece", response_model=StateOut)
def finish_craft_piece(body: CraftPieceIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Tick the current piece of the phase off (done → the next one becomes the
    source), or send done=false to take the last tick back. Logging a sitting is a
    different thing and doesn't move this."""
    player = state.get_or_create_player(db)
    service.finish_craft_piece(db, player, body.done)
    return state.build_state(db, player, _valid_day(day))


@router.post("/craft/phase", response_model=StateOut)
def review_craft_phase(body: CraftPhaseIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Answer the system-design phase check-in: done → the next phase begins; not yet
    → this one carries on. The only thing that moves the plan — there is no date at
    which it advances on its own."""
    player = state.get_or_create_player(db)
    d = _valid_day(day)
    service.review_craft_phase(db, player, body.done, d)
    return state.build_state(db, player, d)


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


# Note: served at /body/state, not /body — the bare /body path belongs to the
# web app's Body tab, so a browser refresh there loads the app, not this JSON.
@router.get("/body/state", response_model=BodyOut)
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
        return insights.add_insight(db, player.id, body_in.url, body_in.kind)
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


# ── Recall: log what you learned → a digest email the next morning ────────────


@router.get("/learnings", response_model=list[LearningOut])
def list_learnings(day: str | None = Query(None), db: Session = Depends(get_db)):
    """What you logged reading or learning on a day, oldest first."""
    player = state.get_or_create_player(db)
    return digest.list_learnings(db, player.id, _valid_day(day))


@router.post("/learnings", response_model=StateOut)
def add_learning(body_in: LearningIn, db: Session = Depends(get_db)):
    """Log something you read or learned. The source alone is enough — notes optional."""
    player = state.get_or_create_player(db)
    day = _valid_day(body_in.day)
    if not body_in.source.strip() and not body_in.text.strip():
        raise HTTPException(400, "Give it a source or a note — something to remember it by.")
    digest.add_learning(db, player.id, day, body_in.kind, body_in.source, body_in.text)
    service.advance_craft_on_log(db, player, body_in.kind, body_in.source)
    return state.build_state(db, player, day)


@router.delete("/learnings/{learning_id}", response_model=StateOut)
def remove_learning(learning_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Drop a logged learning."""
    player = state.get_or_create_player(db)
    digest.remove_learning(db, player.id, learning_id)
    return state.build_state(db, player, _valid_day(day))


@router.get("/digest/preview", response_model=DigestOut)
def preview_digest(day: str | None = Query(None), db: Session = Depends(get_db)):
    """Build a day's digest and return it rendered, without sending. Distilling is
    idempotent, so a later send reuses these highlights rather than paying again."""
    player = state.get_or_create_player(db)
    valid = _valid_day(day)
    if not llm.enabled():
        raise HTTPException(503, "Distilling needs a Gemini key (set ARISE_LLM_API_KEY).")
    try:
        ctx = digest.build_context(db, player, valid)
    except Exception:
        raise HTTPException(502, "Couldn't distil that day — try again in a moment.")
    return {
        "day": valid,
        "subject": digest.subject_for(ctx),
        "highlights": [h["text"] for h in ctx["highlights"]],
        "recall": ctx["recall"],
        "thread": ctx["thread"],
        "html": digest.render_html(ctx),
        "text": digest.render_text(ctx),
    }


@router.get("/recall/library", response_model=list[RecallOut])
def recall_library(day: str | None = Query(None), db: Session = Depends(get_db)):
    """Every highlight ever distilled, in the day's own shuffled order — the shelf
    the app's recall card browses once the due handful runs out."""
    player = state.get_or_create_player(db)
    return digest.recall_library(db, player, _valid_day(day))


@router.patch("/recall/{highlight_id}", response_model=StateOut)
def edit_recall(highlight_id: str, body: RecallEditIn, day: str | None = Query(None),
                db: Session = Depends(get_db)):
    """Rewrite the back of a card — the words stay yours after the distiller's first
    pass. The schedule is untouched."""
    player = state.get_or_create_player(db)
    try:
        result = digest.edit(db, player, highlight_id, body.text)
    except ValueError as err:
        raise HTTPException(422, str(err))
    if result is None:
        raise HTTPException(404, "No such highlight.")
    return state.build_state(db, player, _valid_day(day))


@router.post("/recall/{highlight_id}/grade", response_model=StateOut)
def grade_recall(highlight_id: str, body: RecallGradeIn, day: str | None = Query(None),
                 db: Session = Depends(get_db)):
    """Say how a recall went, and reschedule it. Knew it → further away; no clue →
    back tomorrow. Grading is optional: an ungraded highlight still climbs the ladder
    each time it's shown."""
    player = state.get_or_create_player(db)
    valid = _valid_day(day)
    try:
        result = digest.grade(db, player, highlight_id, body.grade, valid)
    except ValueError as err:
        raise HTTPException(422, str(err))
    if result is None:
        raise HTTPException(404, "No such highlight.")
    return state.build_state(db, player, valid)


@router.post("/digest/send", response_model=DigestSendOut)
def send_digest(day: str | None = Query(None), force: bool = Query(False),
                db: Session = Depends(get_db)):
    """Send a day's digest now — what the nightly job calls. At most once per day
    unless `force`, so a manual send and the job can't both land in the inbox."""
    player = state.get_or_create_player(db)
    if not mailer.enabled():
        raise HTTPException(503, "Sending needs a Resend key and a recipient "
                                 "(set ARISE_RESEND_API_KEY and ARISE_DIGEST_TO).")
    try:
        return digest.send_daily(db, player, _valid_day(day), force=force)
    except Exception as err:
        # Say what actually broke: the nightly job's log is the only place this
        # surfaces, and "couldn't send" alone sends you hunting.
        raise HTTPException(502, f"Couldn't send that digest — {digest._why(err)}")


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


# ── Grocery list (things to buy; tick when bought) ────────────────────────────


@router.post("/grocery", response_model=StateOut)
def add_grocery(body_in: GroceryIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Add something to buy. It shows as a checklist on Body and the You hub."""
    player = state.get_or_create_player(db)
    service.add_grocery(db, player, body_in.name)
    return state.build_state(db, player, _valid_day(day))


@router.post("/grocery/{item_id}/toggle", response_model=StateOut)
def toggle_grocery(item_id: str, body_in: GroceryToggleIn,
                   day: str | None = Query(None), db: Session = Depends(get_db)):
    """Mark a grocery bought (or back to unbought). Bought items stay as a record."""
    player = state.get_or_create_player(db)
    service.toggle_grocery(db, player, item_id, body_in.bought)
    return state.build_state(db, player, _valid_day(day))


@router.delete("/grocery/{item_id}", response_model=StateOut)
def remove_grocery(item_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    service.remove_grocery(db, player, item_id)
    return state.build_state(db, player, _valid_day(day))


# ── Money log (in/out, with today/this-week totals on You) ────────────────────


@router.post("/money", response_model=StateOut)
def add_money(body_in: MoneyIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Log an amount in (income) or out (spending). `bucket` tags spending against the
    50/30/20 rule; it's ignored on money in.

    `day` in the body back-dates the entry to the day the money actually moved; omit
    it and the entry lands on the query day, as every existing caller expects. The
    state that comes back is always for the query day — that's the screen the client
    is looking at, not the day it just filed something under."""
    player = state.get_or_create_player(db)
    d = _valid_day(day)
    on = _valid_day(body_in.day) if body_in.day else d
    # A future entry sits outside every period the app can navigate to, so it would be
    # accepted and then invisible. Refuse it rather than swallow it.
    if on > d:
        raise HTTPException(400, "day cannot be in the future")
    service.add_money(db, player, body_in.amount, body_in.direction, body_in.note, on, bucket=body_in.bucket)
    return state.build_state(db, player, d)


@router.delete("/money", response_model=StateOut)
def reset_money(day: str | None = Query(None), db: Session = Depends(get_db)):
    """Clear the whole money log — a fresh start, balance back to zero."""
    player = state.get_or_create_player(db)
    service.reset_money(db, player)
    return state.build_state(db, player, _valid_day(day))


@router.delete("/money/{entry_id}", response_model=StateOut)
def remove_money(entry_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    service.remove_money(db, player, entry_id)
    return state.build_state(db, player, _valid_day(day))


@router.get("/money/history", response_model=MoneyHistoryOut)
def money_history(
    scope: str = Query("week"),
    day: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """One period of the money log (scope = day | week | month) anchored on `day`."""
    player = state.get_or_create_player(db)
    return state.money_history(db, player, scope, _valid_day(day))


# ── Budget (take-home pay + the standing commitments it's divided across) ─────


@router.put("/budget/income", response_model=StateOut)
def set_income(body_in: IncomeIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Set monthly take-home pay — the base every 50/30/20 line is computed from."""
    player = state.get_or_create_player(db)
    d = _valid_day(day)
    service.set_monthly_income(db, player, body_in.monthly_income, d)
    return state.build_state(db, player, d)


@router.post("/budget/commitments", response_model=StateOut)
def add_commitment(body_in: CommitmentIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Add a standing monthly commitment — a bill, or a planned allowance."""
    player = state.get_or_create_player(db)
    d = _valid_day(day)
    service.add_commitment(
        db, player, body_in.label, body_in.amount, body_in.bucket, body_in.due_day, body_in.variable
    )
    return state.build_state(db, player, d)


@router.patch("/budget/commitments/{commitment_id}", response_model=StateOut)
def update_commitment(
    commitment_id: str,
    body_in: CommitmentPatch,
    day: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Edit one commitment. Only the fields sent are touched."""
    player = state.get_or_create_player(db)
    d = _valid_day(day)
    if not service.update_commitment(
        db, player, commitment_id,
        label=body_in.label, amount=body_in.amount, bucket=body_in.bucket,
        due_day=body_in.due_day, variable=body_in.variable, active=body_in.active,
    ):
        raise HTTPException(status_code=404, detail="No such commitment")
    return state.build_state(db, player, d)


@router.delete("/budget/commitments/{commitment_id}", response_model=StateOut)
def remove_commitment(commitment_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    service.remove_commitment(db, player, commitment_id)
    return state.build_state(db, player, _valid_day(day))


@router.post("/budget/commitments/{commitment_id}/pay", response_model=StateOut)
def pay_commitment(
    commitment_id: str,
    body_in: PayCommitmentIn | None = None,
    day: str | None = Query(None),
    db: Session = Depends(get_db),
):
    """Log a standing commitment as paid — writes the money-log entry for you, tagged
    to the right bucket, so a bill is never typed twice. 409 when it's already been
    paid this month, since paying twice would double-count against the bucket."""
    player = state.get_or_create_player(db)
    d = _valid_day(day)
    amount = body_in.amount if body_in else None
    if not service.pay_commitment(db, player, commitment_id, d, amount):
        raise HTTPException(status_code=409, detail="No such commitment, or already paid this month")
    return state.build_state(db, player, d)


# ── Priority (a self-set focus pinned on top of the plan) ─────────────────────


@router.post("/priority", response_model=StateOut)
def set_priority(body_in: PriorityIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Pin a priority for one attribute — it sits on top of that category's plan."""
    player = state.get_or_create_player(db)
    d = _valid_day(day)
    service.set_priority(db, player, body_in.stat, body_in.focus, body_in.scope, d)
    return state.build_state(db, player, d)


@router.delete("/priority/{stat}", response_model=StateOut)
def clear_priority(stat: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    service.clear_priority(db, player, stat)
    return state.build_state(db, player, _valid_day(day))


# ── Quest journal (reflection notes) ──────────────────────────────────────────


@router.post("/quest-notes", response_model=StateOut)
def add_quest_note(body_in: QuestNoteIn, db: Session = Depends(get_db)):
    """Save what you wrote for a reflective quest. Kept, dated, in the Journal."""
    player = state.get_or_create_player(db)
    service.add_quest_note(
        db, player, body_in.quest_id, _valid_day(body_in.day), body_in.text,
        body_in.prompt, body_in.step_index,
    )
    return state.build_state(db, player, _valid_day(body_in.day))


@router.post("/quest-notes/{note_id}", response_model=StateOut)
def update_quest_note(note_id: str, body_in: QuestNoteUpdateIn, db: Session = Depends(get_db)):
    """Edit a saved reflection (the modal editor saves through here)."""
    player = state.get_or_create_player(db)
    service.update_quest_note(db, player, note_id, body_in.text)
    return state.build_state(db, player, _valid_day(body_in.day))


@router.delete("/quest-notes/{note_id}", response_model=StateOut)
def remove_quest_note(note_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    service.remove_quest_note(db, player, note_id)
    return state.build_state(db, player, _valid_day(day))


# ── Journal (free-form daily entries) ─────────────────────────────────────────


@router.post("/journal", response_model=StateOut)
def add_journal_entry(body_in: JournalEntryIn, db: Session = Depends(get_db)):
    """Write anything for the day — a free journal entry, unlinked to any quest."""
    player = state.get_or_create_player(db)
    service.add_journal_entry(db, player, _valid_day(body_in.day), body_in.text)
    return state.build_state(db, player, _valid_day(body_in.day))


@router.post("/journal/{entry_id}", response_model=StateOut)
def update_journal_entry(entry_id: str, body_in: JournalEntryUpdateIn, db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    service.update_journal_entry(db, player, entry_id, body_in.text)
    return state.build_state(db, player, _valid_day(body_in.day))


@router.delete("/journal/{entry_id}", response_model=StateOut)
def remove_journal_entry(entry_id: str, day: str | None = Query(None), db: Session = Depends(get_db)):
    player = state.get_or_create_player(db)
    service.remove_journal_entry(db, player, entry_id)
    return state.build_state(db, player, _valid_day(day))
