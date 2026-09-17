"""The drawing plan: one ordered walk from seeing to drawing from life.

Built the same way as the Japanese plan, and for the same reason — it is a position,
not a calendar. `Player.sketch_step` is how far along the walk you are, and it moves
when you finish a step, so a week away costs you nothing and a step that wants three
sittings gets them.

The order is Betty Edwards' — *Drawing on the Right Side of the Brain*, already the
book the Creativity quest points at — because her sequence is an argument, not a
syllabus: drawing badly is a seeing problem, so every stage takes one more prop away
from the part of you that draws symbols instead of what's in front of it.

  1. seeing      — prove the gap, then shut the naming half up (upside-down, contour)
  2. spaces      — draw the gaps rather than the thing; the picture plane
  3. proportion  — sighting angles and relationships against a constant
  4. light       — value, the shapes shadows make, the full range
  5. from life   — the whole of it, on real subjects, over and over

The Creativity daily stays a wide pool — drawing, music, photo, video — on purpose:
this walk is the drawing thread inside it, worked on the days the board deals Sketch,
and the quest is free to be a beat or a photo walk on any given one.
"""

from __future__ import annotations

# ── The stages, and the steps inside them ────────────────────────────────────

SEEING = "seeing"
SPACES = "spaces"
PROPORTION = "proportion"
LIGHT = "light"
LIFE = "life"

STAGES: dict[str, str] = {
    SEEING: "Seeing",
    SPACES: "Negative space",
    PROPORTION: "Proportion & angle",
    LIGHT: "Light & value",
    LIFE: "From life",
}

_EDWARDS = "📖 Drawing on the Right Side of the Brain — Betty Edwards"
_PROKO = "🎧 Proko — figure drawing fundamentals"
_LINE_OF_ACTION = "🌐 Line of Action — timed reference for gesture"

_SEEING_STEPS: list[dict] = [
    {
        "stage": SEEING,
        "title": "The before drawings",
        "desc": "30 min — where you actually start",
        "steps": [
            "Draw three from memory, no reference: a person, your own hand, a chair",
            "Date them and put them away — they are the control, not the work",
            "Write one line on what felt hardest; that's the thing the plan is for",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": SEEING,
        "title": "Upside down",
        "desc": "30 min — the naming half gives up",
        "steps": [
            "Find a line drawing, turn it upside down, copy it upside down",
            "Work one line at a time from the corner you started — never name a part",
            "Turn it back over only when you're finished",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": SEEING,
        "title": "Pure contour",
        "desc": "20 min — slow, ugly, honest",
        "steps": [
            "Look only at your own palm's creases, never at the paper, for 5 min",
            "Move eye and pencil at the same speed — every wobble goes down",
            "Do it twice more; it is meant to look wrong",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": SEEING,
        "title": "Modified contour",
        "desc": "30 min — now you may glance",
        "steps": [
            "Same as pure contour, but glance at the page when you lift the pencil",
            "Draw your other hand holding something — keys, a phone, a crumpled bag",
            "Keep the edge unbroken for as long as you can",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": SEEING,
        "title": "Seeing: read it back",
        "desc": "20 min — nothing new today",
        "steps": [
            "Redraw the hand from the before drawings, contour, no memory shortcuts",
            "Put the two side by side and write down the one thing that changed",
        ],
        "resource": _EDWARDS,
    },
]

_SPACE_STEPS: list[dict] = [
    {
        "stage": SPACES,
        "title": "Draw the gaps",
        "desc": "30 min — the chair isn't the subject",
        "steps": [
            "Pick a chair or a bike and draw only the shapes of the empty space",
            "Never draw the object's own edge — the gaps meeting is the edge",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": SPACES,
        "title": "The picture plane",
        "desc": "30 min — a window with a grid",
        "steps": [
            "Hold up a phone screen or a clear sheet and trace the scene's big shapes",
            "Copy what you traced onto paper at a bigger size, shape for shape",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": SPACES,
        "title": "Crop it",
        "desc": "20 min — the frame decides",
        "steps": [
            "Draw one subject three times, cropped tighter each time",
            "Let edges run off the frame — a cropped shape is still a shape",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": SPACES,
        "title": "Negative space: read it back",
        "desc": "20 min — nothing new today",
        "steps": [
            "Draw a houseplant using gaps only, then check the plant appeared anyway",
        ],
        "resource": _EDWARDS,
    },
]

_PROPORTION_STEPS: list[dict] = [
    {
        "stage": PROPORTION,
        "title": "Sighting angles",
        "desc": "30 min — everything against vertical",
        "steps": [
            "Hold the pencil at arm's length and match each edge's angle before drawing it",
            "Draw a room corner — floor, wall, table — angles first, detail never",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": PROPORTION,
        "title": "One unit, everything else",
        "desc": "30 min — measure in heads and hands",
        "steps": [
            "Pick one small feature as the unit and measure the whole subject in it",
            "Block the subject in with that ratio before a single line of detail",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": PROPORTION,
        "title": "Foreshortening",
        "desc": "30 min — the hand pointing at you",
        "steps": [
            "Draw your own hand pointing straight at your eye, sighting every length",
            "Trust the short measurement even when it looks wrong on the page",
        ],
        "resource": _PROKO,
    },
    {
        "stage": PROPORTION,
        "title": "Gesture, fast",
        "desc": "20 min — 30 seconds each",
        "steps": [
            "20 × 30s poses: the line of action first, nothing else",
            "Then 4 × 2 min, same poses, adding only proportion",
        ],
        "resource": _LINE_OF_ACTION,
    },
    {
        "stage": PROPORTION,
        "title": "Proportion: read it back",
        "desc": "20 min — nothing new today",
        "steps": [
            "Redraw the chair from stage 2, sighted this time, and compare the two",
        ],
        "resource": _EDWARDS,
    },
]

_LIGHT_STEPS: list[dict] = [
    {
        "stage": LIGHT,
        "title": "Five values",
        "desc": "20 min — build the scale first",
        "steps": [
            "Make a five-step value strip from white to as dark as the pencil goes",
            "Match three objects in the room to a step on it before drawing anything",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": LIGHT,
        "title": "Shadow shapes",
        "desc": "30 min — one lamp, one object",
        "steps": [
            "Light one object with a single lamp in an otherwise dark room",
            "Draw only where the shadow starts and stops — treat it as a shape, not shading",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": LIGHT,
        "title": "Crumpled paper",
        "desc": "30 min — the hardest easy subject",
        "steps": [
            "Crumple a sheet, light it from one side, draw it in full value",
            "Every plane gets one value — no blending until the planes are right",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": LIGHT,
        "title": "Light: read it back",
        "desc": "20 min — nothing new today",
        "steps": [
            "Draw your own hand again, this time in value only, no outline at all",
        ],
        "resource": _EDWARDS,
    },
]

_LIFE_STEPS: list[dict] = [
    {
        "stage": LIFE,
        "title": "A profile",
        "desc": "40 min — the head from the side",
        "steps": [
            "Sight the skull's proportions before the features, then place eye and ear",
            "Draw someone real — a photo you took, or the mirror at an angle",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": LIFE,
        "title": "Full face",
        "desc": "40 min — the one that scares people",
        "steps": [
            "Block in the head, sight the features against each other, then value",
            "Give it the full sitting — this is the book's exit exam",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": LIFE,
        "title": "Still life, full range",
        "desc": "40 min — everything at once",
        "steps": [
            "Set up three objects with one light and draw them start to finish",
            "Space, then proportion, then value — in that order, no skipping ahead",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": LIFE,
        "title": "The after drawings",
        "desc": "30 min — the control, repeated",
        "steps": [
            "Draw the same three from the first step: a person, your hand, a chair",
            "Put them beside the before drawings. That gap is the whole plan's point",
        ],
        "resource": _EDWARDS,
    },
    {
        "stage": LIFE,
        "title": "Draw what's in front of you",
        "desc": "30 min — the one that doesn't end",
        "steps": [
            "Pick anything in the room and draw it from observation, whole sitting",
            "Keep a date on every page — the plan holds here for as long as you want it",
        ],
        "resource": _EDWARDS,
    },
]

PLAN: list[dict] = [
    *_SEEING_STEPS,
    *_SPACE_STEPS,
    *_PROPORTION_STEPS,
    *_LIGHT_STEPS,
    *_LIFE_STEPS,
]

LAST_STEP = len(PLAN) - 1


def step_at(position: int) -> dict:
    """The step held at `position`, clamped. Past the end the plan holds on its last
    step rather than running out — drawing from life is where it was always going."""
    return PLAN[max(0, min(position, LAST_STEP))]


def progress(position: int) -> dict:
    """Where the plan stands: the stage being worked, the step inside it, and how far
    along the whole walk you are. Same shape as `japanese.progress`, because the two
    walks are the same kind of thing and the card that draws them is one card."""
    at = max(0, min(position, LAST_STEP))
    stage = PLAN[at]["stage"]
    in_stage = [n for n, s in enumerate(PLAN) if s["stage"] == stage]
    return {
        "stage": stage,
        "stage_label": STAGES[stage],
        "step": PLAN[at]["title"],
        "done": in_stage.index(at),
        "steps": len(in_stage),
        "position": at,
        "positions": len(PLAN),
    }


def next_position(position: int) -> int:
    """Where the plan stands once you've finished the step you were holding. Held at
    the last step rather than running out — there is no day drawing is finished."""
    return min(max(0, position) + 1, LAST_STEP)
