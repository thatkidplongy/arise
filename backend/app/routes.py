from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from . import service, state
from .db import get_db
from .schemas import (
    ActionResult,
    BookIn,
    BookReviewIn,
    CompleteIn,
    PlayerIn,
    PreferencesIn,
    StateOut,
    StepResult,
    StepToggleIn,
)

router = APIRouter()


def _valid_day(day: str | None) -> str:
    if day is None:
        return date.today().isoformat()
    try:
        date.fromisoformat(day)
    except ValueError:
        raise HTTPException(400, "day must be YYYY-MM-DD")
    return day


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
    """Set a focus per attribute (STR/CRE/SPI/CHA/INT). Blank clears it.
    A set focus themes that attribute's side quest."""
    player = state.get_or_create_player(db)
    service.update_preferences(db, player, body.preferences)
    return state.build_state(db, player, _valid_day(day))


@router.put("/book", response_model=StateOut)
def set_book(body: BookIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Set or change the book you're currently reading. Send "" to clear it."""
    player = state.get_or_create_player(db)
    service.set_book(db, player, body.current_book, _valid_day(day))
    return state.build_state(db, player, _valid_day(day))


@router.post("/book/review", response_model=StateOut)
def review_book(body: BookReviewIn, day: str | None = Query(None), db: Session = Depends(get_db)):
    """Answer the weekly reading review: finished → counts it and rolls to
    next_book; not yet → keeps the current book. Asked once per new week."""
    player = state.get_or_create_player(db)
    service.review_book(db, player, body.finished, body.next_book, _valid_day(day))
    return state.build_state(db, player, _valid_day(day))


@router.post("/reset", response_model=StateOut)
def reset(day: str | None = Query(None), db: Session = Depends(get_db)):
    """Erase all progress (completions + achievements). Name is kept."""
    player = state.get_or_create_player(db)
    service.reset_all(db, player)
    return state.build_state(db, player, _valid_day(day))
