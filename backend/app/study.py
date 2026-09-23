"""The one study card the Learn tab shows, and which subject it's on today.

Three subjects are being worked through — system design, Japanese and drawing. The
board deals Japanese or drawing every day, taking turns, and Craft on Mon/Wed/Fri as
well (see `state.active_daily_ids`). Learn used to ignore that and show the
system-design card every single day, naming a subject the day wasn't on and hiding the
ones it was. Now the cards follow the board: one card per subject today deals, the same
schedule in both places.

The schedule stays in `state` — this module never re-derives it. It's handed the
day's daily quest ids and looks up which subject they carry, so the schedule has one
owner and the two can't drift apart.

The three subjects are shaped differently underneath and that's fine:

  craft     a phase with a source you choose, advanced by logging a sitting against
            the piece you're holding (see `state.craft_of`)
  japanese  a fixed position along a walk, advanced when the step is finished
  sketch    the same, along Betty Edwards' sequence

What this module does is make them one shape, so the app draws one card rather than
three, and so adding a fourth subject later is a plan and a row in SUBJECTS.
"""

from __future__ import annotations

from types import ModuleType

CRAFT = "craft"
JAPANESE = "japanese"
SKETCH = "sketch"

# The daily quest a subject belongs to. Whichever of these the board deals today are
# the subjects Learn shows, in this order.
SUBJECT_BY_DAILY: dict[str, str] = {
    "d-craft": CRAFT,
    "d-jp": JAPANESE,
    "d-sketch": SKETCH,
}

# `unit` is what the stretch is called on the card — Craft reads in phases of a
# reading plan, the two walks move through stages of a curriculum.
SUBJECTS: dict[str, dict[str, str]] = {
    CRAFT: {"title": "System design", "stat": "CFT", "unit": "Phase"},
    JAPANESE: {"title": "Japanese", "stat": "INT", "unit": "Stage"},
    SKETCH: {"title": "Drawing", "stat": "CRE", "unit": "Stage"},
}


def subjects_for(daily_ids: set[str]) -> list[str]:
    """Which subjects today's board carries, in SUBJECT_BY_DAILY's order — Craft first
    on the days it's dealt, then the day's walk. Empty on a day with no study daily.

    Takes the ids rather than the date so the schedule keeps its single owner in
    `state`.
    """
    return [subject for quest_id, subject in SUBJECT_BY_DAILY.items() if quest_id in daily_ids]


def craft_card(craft: dict) -> dict:
    """The system-design phase, in the shared card shape. Craft brings its own source,
    its own check-in and a plan of named pieces, so nothing is derived here — the extra
    keys are the ones the other two subjects also answer."""
    return {
        **craft,
        "subject": CRAFT,
        **SUBJECTS[CRAFT],
        "steps": [],  # the piece *is* the instruction: a chapter to read
        "resource": "",
    }


def walk_card(subject: str, plan: ModuleType, position: int) -> dict:
    """A position along a fixed walk (Japanese, drawing), in the shared card shape.

    The stage is the stretch, so the bar answers 'how much of this stage have I
    covered' exactly as Craft's answers it for a phase. There's no check-in to answer
    and no source to choose: the plan names the step, and finishing it is what moves
    you on — so `pending` is never true and `source` is always empty.
    """
    at = plan.progress(position)
    step = plan.step_at(position)
    stages = list(plan.STAGES)
    titles = [s["title"] for s in plan.PLAN if s["stage"] == at["stage"]]
    pieces = at["steps"]
    done = at["done"]
    return {
        "subject": subject,
        **SUBJECTS[subject],
        "phase": stages.index(at["stage"]) + 1,
        "phases": len(stages),
        "label": at["stage_label"],
        "detail": step["desc"],
        "plan": titles,
        "piece": step["title"],
        "steps": list(step["steps"]),
        "resource": step["resource"],
        "source": "",
        "done": done,
        "studied": done,
        "pieces": pieces,
        "progress": round(min(1.0, done / pieces), 3) if pieces else 0.0,
        "is_last": position >= plan.LAST_STEP,
        "pending": False,
    }
