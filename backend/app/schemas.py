"""Pydantic models — the API contract. FastAPI renders these at /docs."""

from datetime import datetime

from pydantic import BaseModel, Field

# ── Requests ─────────────────────────────────────────────────────────────────


class CompleteIn(BaseModel):
    quest_id: str
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Client-local date")


class StepToggleIn(BaseModel):
    quest_id: str
    step_index: int = Field(ge=0)
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Client-local date")


class PlayerIn(BaseModel):
    name: str | None = None
    equipped_title: str | None = None
    north_star: str | None = None


class BookIn(BaseModel):
    current_book: str = ""
    chapters: int = 0  # optional total chapters — sets the reading pace; 0 = unknown


class BookReviewIn(BaseModel):
    finished: bool
    next_book: str = ""  # only used when finished is true


class InterviewModeIn(BaseModel):
    enabled: bool  # Craft (CFT): shift quests to interview prep when true


# ── Body (standalone wellness tools) ──────────────────────────────────────────


class BodyProfileIn(BaseModel):
    sex: str = "unspecified"  # male | female | unspecified
    age: int = Field(0, ge=0, le=120)
    height_cm: int = Field(0, ge=0, le=260)
    weight_kg: float = Field(0, ge=0, le=400)
    activity: str = "moderate"  # sedentary | light | moderate | active | very_active
    goal: str = "maintain"  # maintain | gentle_loss | gentle_gain (fallback when no goal weight)
    goal_weight_kg: float = Field(0, ge=0, le=400)  # 0 = not set → use goal


class FoodLogIn(BaseModel):
    name: str
    grams: int = Field(0, ge=0)  # 0 = a serving / unspecified
    kcal: int = Field(0, ge=0)
    protein_g: int = Field(0, ge=0)
    fibre_g: int = Field(0, ge=0)


class FoodAnalyzeIn(BaseModel):
    image: str  # base64-encoded image bytes (no data: prefix)
    mime: str = "image/jpeg"


class SkincareStepIn(BaseModel):
    routine: str  # AM | PM
    text: str


class SkincareCheckIn(BaseModel):
    step_id: str
    done: bool


class BodyProfileOut(BaseModel):
    sex: str
    age: int
    height_cm: int
    weight_kg: float
    activity: str
    goal: str
    goal_weight_kg: float


class TargetsOut(BaseModel):
    bmr: int
    tdee: int
    target: int
    target_low: int
    target_high: int
    protein_g: int
    fibre_g: int
    bmi: float
    bmi_category: str  # underweight | healthy | overweight | obese
    healthy_low: float  # healthy-BMI weight range for the height, kg
    healthy_high: float
    goal_weight: float  # echoed back; 0 when not set


class FoodEntryOut(BaseModel):
    id: str
    name: str
    grams: int
    kcal: int
    protein_g: int
    fibre_g: int


class FoodDayOut(BaseModel):
    entries: list[FoodEntryOut]
    total_kcal: int
    total_protein: int
    total_fibre: int


class FoodSearchItemOut(BaseModel):
    name: str
    brand: str
    kcal_100g: int
    protein_100g: int
    fibre_100g: int
    serving_size: str


class SuggestionOut(BaseModel):
    name: str
    serving: str
    kcal: int
    protein_g: int
    fibre_g: int
    tag: str  # protein | fibre | meal


class FoodEstimateOut(BaseModel):
    """An AI estimate from a photo — shown for the user to edit before logging."""
    name: str
    kcal: int
    protein_g: int
    fibre_g: int
    note: str  # a short caveat/assumption, or ""
    source: str = ""  # 'label' (read off a Nutrition Facts panel), 'food', 'none'


class BookOut(BaseModel):
    title: str
    author: str
    pages: int  # 0 if unknown
    cover_url: str  # "" if none
    year: int  # 0 if unknown


class BookShelfOut(BaseModel):
    label: str  # Grow | Money | Craft | Calm …
    books: list[BookOut]


class SkincareStepOut(BaseModel):
    id: str
    routine: str
    text: str
    done: bool  # ticked for the requested day


class BodyOut(BaseModel):
    day: str
    profile: BodyProfileOut | None  # null until set
    targets: TargetsOut | None  # null until the profile has real numbers
    food: FoodDayOut
    suggestions: list[SuggestionOut]  # today's protein/fibre-forward "what to eat"
    skincare_am: list[SkincareStepOut]
    skincare_pm: list[SkincareStepOut]
    skincare_resources: list[str]
    skincare_note: str


class PreferencesIn(BaseModel):
    # {stat: [focus, ...]}; the full set per attribute. Empty list clears it.
    preferences: dict[str, list[str]] = {}
    # {stat: "where I'm at"}; optional per-attribute level note for LLM sequencing.
    levels: dict[str, str] = {}


# ── Responses ────────────────────────────────────────────────────────────────


class PlayerOut(BaseModel):
    name: str
    equipped_title: str | None
    north_star: str
    created_at: datetime
    level: int
    xp_into: int
    xp_needed: int
    total_xp: int
    rank: str
    current_book: str
    current_book_chapters: int
    books_finished: int
    interview_mode: bool


class BookReviewOut(BaseModel):
    pending: bool  # true when the weekly "did you finish it?" review is due
    book: str


class StatOut(BaseModel):
    key: str
    level: int
    into: int
    needed: int


class ProgressionOut(BaseModel):
    """Earned difficulty for one attribute (see progression.py)."""
    level: int  # current difficulty tier — climbs the floor / content band
    peak: int  # highest tier ever reached; never drops (permanent, SL-style)
    cap: int  # the ceiling tier for this attribute
    required: int  # days to clear this week to level up (3 + level, capped at 6)
    cleared_this_week: int  # days cleared so far this week (progress to next level)
    band: int  # content band the level maps to: 0 foundation, 1 building, 2 depth


class StreakOut(BaseModel):
    current: int
    best: int


class TodayOut(BaseModel):
    day: str
    xp: int
    dailies_done: int
    dailies_total: int
    cleared: bool
    resting: bool


class RankGateOut(BaseModel):
    rank: str
    level: int
    streak: int


class QuestOut(BaseModel):
    id: str
    title: str
    desc: str
    resource: str  # a trusted place to learn, or "" — see quests.RESOURCES
    steps: list[str]
    steps_done: list[bool]  # aligned with steps; which are ticked this period
    stat: str
    xp: int
    cadence: str
    target: int
    done: int
    undoable_id: str | None


class AchievementOut(BaseModel):
    id: str
    name: str
    desc: str
    title_reward: str | None
    unlocked_at: datetime | None


class RecordOut(BaseModel):
    active_days: int
    total_completions: int


class StateOut(BaseModel):
    player: PlayerOut
    stats: list[StatOut]
    streak: StreakOut
    today: TodayOut
    book_review: BookReviewOut
    next_rank: RankGateOut | None
    preferences: dict[str, list[str]]
    levels: dict[str, str]
    progression: dict[str, ProgressionOut]  # per-attribute earned difficulty (STR, INT, …)
    llm_enabled: bool  # true when a Gemini key is configured (quests are personalised)
    quests: list[QuestOut]
    achievements: list[AchievementOut]
    record: RecordOut


class EventOut(BaseModel):
    type: str  # daily_clear | level_up | rank_up | achievement
    data: dict


class ActionResult(BaseModel):
    events: list[EventOut]
    state: StateOut


class StepResult(BaseModel):
    events: list[EventOut]
    state: StateOut
    completed: bool  # true when this toggle just completed the quest
