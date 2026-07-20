"""Pydantic models — the API contract. FastAPI renders these at /docs."""

from datetime import datetime
from typing import Literal

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


class InsightAddIn(BaseModel):
    url: str = Field(min_length=8, description="A public TikTok / Reel / Short video URL")
    kind: str = Field(default="motivation", pattern=r"^(motivation|tips)$",
                      description="'motivation' (quotes + daily nudge) or 'tips' (a practical playbook)")


class AvatarIn(BaseModel):
    avatar: str = ""  # image data URI (base64), or "" to clear


class ReminderIn(BaseModel):
    text: str = Field(min_length=1, max_length=200)


class ReminderToggleIn(BaseModel):
    done: bool


class GroceryIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class GroceryToggleIn(BaseModel):
    bought: bool


class MoneyIn(BaseModel):
    amount: float = Field(gt=0, le=1_000_000_000)
    direction: Literal["in", "out"]  # money in (income) or out (spending)
    note: str = Field("", max_length=120)


class PriorityIn(BaseModel):
    stat: str = Field(min_length=3, max_length=3)     # the attribute to prioritise (STR, CRE, …)
    focus: str = Field(min_length=1, max_length=60)   # e.g. "abs", "passive income"
    scope: Literal["day", "week", "open"] = "week"    # today / this ISO week / until cleared


class QuestNoteIn(BaseModel):
    quest_id: str
    text: str = Field(min_length=1, max_length=2000)  # lightweight Markdown
    prompt: str = Field("", max_length=500)  # the write-step/question being answered
    step_index: int | None = Field(None, ge=0)  # the step that produced it (binds note↔step)
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Client-local date")


class QuestNoteUpdateIn(BaseModel):
    text: str = Field(min_length=1, max_length=2000)  # lightweight Markdown
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Client-local date")


class JournalEntryIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)  # free-form Markdown
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Client-local date")


class JournalEntryUpdateIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Client-local date")


# ── Body (standalone wellness tools) ──────────────────────────────────────────


class BodyProfileIn(BaseModel):
    sex: str = "unspecified"  # male | female | unspecified
    age: int = Field(0, ge=0, le=120)
    height_cm: int = Field(0, ge=0, le=260)
    weight_kg: float = Field(0, ge=0, le=400)
    activity: str = "moderate"  # sedentary | light | moderate | active | very_active
    goal: str = "maintain"  # maintain | gentle_loss | gentle_gain (fallback when no goal weight)
    goal_weight_kg: float = Field(0, ge=0, le=400)  # 0 = not set → use goal
    country: str = ""  # "" = worldwide; "PH" = localised food picks


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
    country: str = ""  # "" = worldwide; "PH" = localised food picks


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


class SkincareProductPickOut(BaseModel):
    """A concrete product to buy for a routine step (localised to what's on shelves)."""
    slot: str     # AM | PM
    step: str     # e.g. "Sunscreen"
    brand: str
    product: str
    why: str


class SkincareNoteOut(BaseModel):
    label: str   # e.g. "Niacinamide" / "Fragrance"
    detail: str  # one gentle line on why it's flagged


class SkincareProductOut(BaseModel):
    """A product from Open Beauty Facts, with a read of its ingredients."""
    name: str
    brand: str
    ingredients: str  # the raw INCI list (truncated), for the curious
    helpful: list[SkincareNoteOut]  # actives that help pigmentation & pores
    watch: list[SkincareNoteOut]    # worth knowing if your skin runs sensitive


class BodyOut(BaseModel):
    day: str
    profile: BodyProfileOut | None  # null until set
    targets: TargetsOut | None  # null until the profile has real numbers
    food: FoodDayOut
    suggestions: list[SuggestionOut]  # today's protein/fibre-forward "what to eat"
    skincare_am: list[SkincareStepOut]
    skincare_pm: list[SkincareStepOut]
    skincare_products: list[SkincareProductPickOut]  # what to buy, localised
    skincare_resources: list[str]
    skincare_note: str
    skincare_streak: int  # consecutive days a routine block was completed
    skincare_days: int    # total days you've done your routine


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
    has_avatar: bool  # true when a profile picture is set (fetch it from /player/avatar)


class BookReviewOut(BaseModel):
    pending: bool  # true when the weekly "did you finish it?" review is due
    book: str


class WeekReviewOut(BaseModel):
    """A recap of the current ISO week, for the 'This week' summary."""
    week: str
    xp: int
    completions: int   # quest completions this week (excludes rest/bonus)
    active_days: int   # distinct days you showed up (rest days included)
    days_cleared: int  # days all dailies were cleared
    by_stat: dict[str, int]  # completions per attribute this week
    top_stat: str | None     # the attribute leaned into most (None if nothing yet)


class ReadingOut(BaseModel):
    """Read-only progress on the current book, for the Status screen."""
    book: str
    chapters: int  # 0 = unknown
    books_finished: int
    days_read: int  # days the reading daily was done since this book began
    days_to_finish: int  # target days at the current reading pace
    progress: float  # 0..1 — days_read / days_to_finish (capped)
    per_day: str  # today's reading target, e.g. "Read a chapter of …"
    done_today: bool  # reading daily already ticked today


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


class QuestNoteOut(BaseModel):
    id: str
    text: str
    step: int | None = None  # the step this note answers, so the UI can pair them


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
    notes: list[QuestNoteOut]  # notes jotted this period for this quest (via write-steps)


class AchievementOut(BaseModel):
    id: str
    name: str
    desc: str
    title_reward: str | None
    unlocked_at: datetime | None


class RecordOut(BaseModel):
    active_days: int
    total_completions: int
    xp: int                  # total XP earned all time
    days_cleared: int        # days every daily was cleared, all time
    top_stat: str | None     # the attribute leaned into most overall (None if nothing yet)


class InsightOut(BaseModel):
    """A captured video distilled into keepable takeaways + pull-quotes."""
    id: str
    source_url: str
    source: str  # tiktok | instagram | youtube | web
    kind: str  # motivation | tips
    title: str
    summary: str
    takeaways: list[str]
    steps: list[str] = []  # optional actions (tips only; empty for motivation)
    quotes: list[str]
    created_at: datetime


class DailyQuoteOut(BaseModel):
    """One pull-quote surfaced on Status today, rotating by the date."""
    text: str
    source_title: str
    insight_id: str


class AvatarOut(BaseModel):
    avatar: str  # data URI, or "" when none


class HistoryItemOut(BaseModel):
    """One finished quest in the You → History log."""
    id: str
    quest_id: str
    title: str
    stat: str      # STR | CRE | SPI | CHA | INT | WLT | CFT (empty if the slug is gone)
    cadence: str   # daily | weekly | side
    xp: int
    day: str       # client-local 'YYYY-MM-DD'
    at: datetime


class ReminderOut(BaseModel):
    id: str
    text: str
    done: bool
    done_at: datetime | None = None  # when it was ticked — powers the Completed record


class GroceryOut(BaseModel):
    id: str
    name: str
    bought: bool
    bought_at: datetime | None = None  # when it was bought — powers the Completed record


class MoneyEntryOut(BaseModel):
    id: str
    amount: float
    direction: str  # 'in' | 'out'
    note: str
    day: str
    created_at: datetime


class MoneyOut(BaseModel):
    """The money log plus the totals the You tab shows — today and this ISO week."""
    entries: list[MoneyEntryOut]  # newest first
    today_in: float
    today_out: float
    week_in: float
    week_out: float
    balance: float  # money remaining — all time in minus out


class PriorityOut(BaseModel):
    """A pinned priority for one attribute — sits on top of that category's plan."""
    stat: str   # STR | CRE | SPI | CHA | INT | WLT | CFT
    focus: str
    scope: str  # 'day' | 'week' | 'open'
    title: str
    note: str
    steps: list[str]


class ReflectionOut(BaseModel):
    """One quest-linked reflection (from a requires_log quest), for the Reflections
    view of the Journal."""
    id: str
    quest_id: str
    stat: str  # STR | CRE | SPI | CHA | INT | WLT | CFT — colours/labels the entry
    prompt: str = ""  # the write-step/question this answers (empty for older notes)
    day: str
    text: str
    created_at: datetime


class JournalEntryOut(BaseModel):
    """One free-form daily journal entry (unlinked to any quest)."""
    id: str
    day: str
    text: str
    created_at: datetime


class StateOut(BaseModel):
    player: PlayerOut
    stats: list[StatOut]
    streak: StreakOut
    today: TodayOut
    book_review: BookReviewOut
    reading: ReadingOut | None  # progress on the current book, or null when none set
    week_review: WeekReviewOut  # a gentle recap of the current ISO week
    next_rank: RankGateOut | None
    preferences: dict[str, list[str]]
    levels: dict[str, str]
    progression: dict[str, ProgressionOut]  # per-attribute earned difficulty (STR, INT, …)
    llm_enabled: bool  # true when a Gemini key is configured (quests are personalised)
    transcript_enabled: bool  # true when a Supadata key is set (Inspire capture is on)
    daily_quote: DailyQuoteOut | None  # a rotating pull-quote from captured videos
    quests: list[QuestOut]
    priorities: list[PriorityOut]  # self-set focuses pinned on top of the plan, one per attribute
    achievements: list[AchievementOut]
    record: RecordOut
    reminders: list[ReminderOut]  # a plain personal list shown on Status
    grocery: list[GroceryOut]  # things to buy — ticked off once bought
    money: MoneyOut  # the money log (in/out) + today/this-week totals, on You
    journal: list[JournalEntryOut]  # free-form daily entries, newest first
    reflections: list[ReflectionOut]  # quest-linked takeaways, newest first


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
