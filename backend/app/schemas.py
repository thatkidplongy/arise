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
    chapters: int = 0  # optional book length — the finish line, not a quota; 0 = unknown


class ReadingLogIn(BaseModel):
    """A sitting of reading, as the hunter counts it."""
    chapters: int = Field(1, ge=1, le=200, description="How many chapters this sitting")
    label: str = Field("", max_length=120, description="Which ones — '5–7', 'the intro'")
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Client-local date")


class BookReviewIn(BaseModel):
    finished: bool
    next_book: str = ""  # only used when finished is true


class CraftSourceIn(BaseModel):
    """The one thing Craft is studying. "" clears it."""
    source: str = Field("", max_length=160)


class CraftPhaseIn(BaseModel):
    """Answer to the system-design phase check-in."""
    done: bool  # True → advance to the next phase; False → hold this one


class CraftPieceIn(BaseModel):
    """Tick the current piece of the phase off, or take the last tick back."""
    done: bool  # True → this piece is covered, move to the next; False → undo one


class CraftOut(BaseModel):
    """Where the hunter is in the system-design plan, measured in pieces covered."""
    phase: int
    phases: int
    source: str  # the one thing currently being studied ('' = not set)
    label: str
    detail: str
    plan: list[str]  # the phase's pieces, in the order you'd take them
    piece: str       # the plan's next uncovered piece ('' once the phase is covered)
    done: int        # pieces ticked off in this phase
    studied: int     # notes logged since this phase began — sittings, not pieces
    pieces: int      # how many the phase holds — a denominator, never a deadline
    progress: float
    is_last: bool
    pending: bool  # the check-in is due


class InterviewModeIn(BaseModel):
    enabled: bool  # Craft (CFT): shift quests to interview prep when true


class InsightAddIn(BaseModel):
    url: str = Field(min_length=8, description="A public TikTok / Reel / Short video URL")
    kind: str = Field(default="motivation", pattern=r"^(motivation|tips)$",
                      description="'motivation' (quotes + daily nudge) or 'tips' (a practical playbook)")


class LearningIn(BaseModel):
    kind: str = Field(default="other", pattern=r"^(book|notion|article|work|video|other)$")
    source: str = Field("", max_length=200)  # what it was — title + chapters, a page, a URL
    text: str = Field("", max_length=4000)  # optional notes; the source alone is enough
    day: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$", description="Client-local date")


class RecallEditIn(BaseModel):
    """New words for the back of a card."""
    text: str


class RecallGradeIn(BaseModel):
    """How a recall went. 'got' pushes it further out, 'shaky' holds the spacing,
    'missed' brings it back tomorrow."""
    grade: str = Field(pattern=r"^(got|shaky|missed)$")


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
    # Which 50/30/20 bucket this spending counts against. Only meaningful on money
    # out — income isn't divided, it's what the division is of.
    bucket: Literal["needs", "wants"] | None = None
    # The day the money actually moved, when that isn't the day it was typed in. A
    # spend recalled on Friday belongs on Tuesday, otherwise the weekday ends up in
    # the note and every back-filled spend piles onto one day. Blank = the request's
    # own day, which is what every caller that doesn't care sends.
    day: str = Field("", pattern=r"^(\d{4}-\d{2}-\d{2})?$")


class PayCommitmentIn(BaseModel):
    """Log a standing commitment as paid. `amount` overrides the planned figure,
    which is what a variable allowance like groceries needs."""
    amount: float | None = Field(None, gt=0, le=1_000_000_000)
    # The day the bill was actually paid, when that isn't the day it was tapped — one
    # remembered on Sunday belongs on Friday. Same split as MoneyIn.day: this is when
    # the money moved, while the query day stays the screen doing the asking. Blank =
    # the request's own day, which is what tapping a bill as you pay it sends.
    day: str = Field("", pattern=r"^(\d{4}-\d{2}-\d{2})?$")


class IncomeIn(BaseModel):
    """Monthly take-home pay — the base the 50/30/20 lines are computed from."""
    monthly_income: float = Field(ge=0, le=1_000_000_000)


class CommitmentIn(BaseModel):
    """A standing monthly commitment: a bill, or a planned allowance like groceries.
    Only 'needs' and 'wants' — savings is the remainder, never a thing you commit to."""
    label: str = Field(min_length=1, max_length=60)
    amount: float = Field(gt=0, le=1_000_000_000)
    bucket: Literal["needs", "wants"]
    due_day: int = Field(0, ge=0, le=31)   # day of the month, 0 = no fixed date
    variable: bool = False                # an allowance whose real amount moves


class CommitmentPatch(BaseModel):
    """Every field optional — the app flips `active` or nudges one amount without
    resending the whole row."""
    label: str | None = Field(None, min_length=1, max_length=60)
    amount: float | None = Field(None, gt=0, le=1_000_000_000)
    bucket: Literal["needs", "wants"] | None = None
    due_day: int | None = Field(None, ge=0, le=31)
    variable: bool | None = None
    active: bool | None = None


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
    """One plate. Portions are the normal case; the gram/calorie fields are only
    filled in for a food that genuinely came with numbers (a label, a lookup)."""
    name: str
    slot: str = ""  # breakfast | lunch | dinner | snack; "" = unsaid
    place: str = ""  # where it was eaten; "" = unsaid
    at_time: str = ""  # the clock the hunter saw, 'HH:MM' — `at` is UTC
    protein_p: int = Field(0, ge=0, le=12)  # palms
    veg_p: int = Field(0, ge=0, le=12)      # fists
    carb_p: int = Field(0, ge=0, le=12)     # cupped hands
    extra_p: int = Field(0, ge=0, le=12)    # sweet drinks & fried
    grams: int = Field(0, ge=0)  # 0 = a serving / unspecified
    kcal: int = Field(0, ge=0)
    protein_g: int = Field(0, ge=0)
    fibre_g: int = Field(0, ge=0)
    # Where the figures came from: 'claude' (handed over from the Claude app),
    # 'photo' (read in app), 'label' (off a nutrition panel), '' (counted by hand).
    # Anything else is stored as '' — an unrecognised claim of provenance is worse
    # than none.
    source: str = ""


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
    slot: str  # breakfast | lunch | dinner | snack; "" = unsaid
    place: str  # where it was eaten; "" = unsaid
    at_time: str  # 'HH:MM' as the hunter's own clock read it; "" on older rows
    protein_p: int
    veg_p: int
    carb_p: int
    extra_p: int
    grams: int
    kcal: int
    protein_g: int
    fibre_g: int
    # 'claude' | 'photo' | 'label' | '' (hand-counted). The screen badges the row
    # from this, so an estimate never looks like a measurement.
    source: str = ""
    # This row's own honest range, derived from the same portion table the week
    # uses. Wide on a plate of hands, tight on a label read.
    kcal_low: int = 0
    kcal_high: int = 0


class PlateOut(BaseModel):
    """A day in hands — as a tally, as a target, or as one saved plate."""
    protein: int  # palms
    veg: int      # fists
    carb: int     # cupped hands
    extra: int    # sweet drinks & fried


class FoodDayOut(BaseModel):
    entries: list[FoodEntryOut]
    plate: PlateOut  # what the day's plates added up to, in hands
    # Only what was logged with real numbers; zero on a day logged entirely in
    # hands.
    total_kcal: int
    total_protein: int
    total_fibre: int
    # The day as a range against the band — never a point figure. Same estimate
    # the week is built from, so the day and the trend cannot disagree.
    kcal_low: int = 0
    kcal_high: int = 0
    in_band: bool = False
    band_low: int = 0  # 0 until the profile has real numbers
    band_high: int = 0


class UsualOut(PlateOut):
    """A plate logged before — one tap to log it again."""
    name: str
    count: int  # times it's been logged inside the window


class FoodWeekDayOut(PlateOut):
    day: str
    logged: int  # plates logged that day
    kcal_low: int
    kcal_high: int
    in_band: bool  # the day's range overlaps the target band


class FoodWeekOut(BaseModel):
    """The rolling seven days as a calorie range against the band — the widest lens
    on the same estimate the day shows, and the one where the error averages out."""
    days: list[FoodWeekDayOut]
    logged_days: int
    in_band_days: int
    band_low: int   # 0 until the profile has real numbers
    band_high: int
    # Per logged day, estimated across the whole week at once.
    kcal_low: int
    kcal_high: int
    protein_low: int
    protein_high: int
    fibre_low: int
    fibre_high: int


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
    """An AI estimate from a photo — shown for the user to edit before logging.
    A plated meal comes back in hand portions (what the app logs); a packaged
    label comes back in the numbers it printed."""
    name: str
    protein_p: int = 0
    veg_p: int = 0
    carb_p: int = 0
    extra_p: int = 0
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
    plate_targets: PlateOut | None  # the same targets in hands; null without a profile
    food: FoodDayOut
    usuals: list[UsualOut]  # plates logged before, most-repeated first
    week: FoodWeekOut  # the rolling seven days, for the trend screen
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


class ReadingLogOut(BaseModel):
    """One logged sitting, for showing (and undoing) what was recorded today."""
    id: str
    label: str  # which chapters, verbatim ('' when only a count was given)
    chapters: int


class ReadingOut(BaseModel):
    """Read-only progress on the current book, for the Status screen."""
    book: str
    chapters: int  # the book's length; 0 = unknown
    books_finished: int
    chapters_read: int  # how far in the logged chapters put you (furthest named wins)
    days_read: int  # days the reading daily was done since this book began
    progress: float  # 0..1 — chapters_read / chapters; 0 when the length is unknown
    measure: str  # 'chapters' when the book's length is known, else 'count' (no bar)
    logged_today: list[ReadingLogOut]
    done_today: bool  # something logged today (or the reading daily ticked)


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


class CaptureFailureOut(BaseModel):
    """A link that never distilled, kept so it can be tried again."""
    id: str
    source_url: str
    source: str  # tiktok | instagram | youtube | web
    kind: str  # motivation | tips
    title: str
    reason: str  # no_key | no_speech | fetch_failed | distill_failed | failed
    detail: str  # the line the card shows
    attempts: int
    retryable: bool  # false only for no_speech — nothing there to distil
    last_tried_at: datetime
    created_at: datetime


class CaptureSweepOut(BaseModel):
    """The result of retrying the kept links: what landed, what didn't, and what the
    sweep's bounds left for next time (never silently dropped)."""
    captured: list[InsightOut]
    failed: int  # tried again and failed again
    untried: int  # retryable links the sweep's bounds didn't reach
    remaining: list[CaptureFailureOut]


class LearningOut(BaseModel):
    """One thing read or learned on a day — the raw capture, before distilling."""
    id: str
    day: str
    kind: str  # book | notion | article | work | video | other
    source: str
    text: str
    created_at: datetime


class RecallOut(BaseModel):
    """An older highlight resurfacing — the spaced half of the digest."""
    id: str
    text: str
    cue: str = ""  # the question `text` answers; empty on rows distilled before cues
    hook: str = ""  # a memory aid; empty only on rows distilled before every line had one
    box: int = 0  # Leitner rung — higher means it keeps being recalled
    day: str  # the day it was learned
    source_label: str
    material: str = ""  # source_label without chapter markers — the per-book pile it files under
    chapter: str = ""  # just the chapter marker, for the card's corner tag
    seen: int = 0  # times actually met — a digest send or a grade, never a plain read
    own_words: bool = False  # the answer came from a note the reader wrote, not just a named source
    origin: str = ""  # where the card was born, for the back — empty on derived highlights
    if_missed: int = 0  # days until it returns, per grade — so the buttons can say so
    if_shaky: int = 0
    if_got: int = 0
    days_ago: int


class ThreadOut(BaseModel):
    """The running one-sentence summary of a book, recondensed each sitting."""
    title: str  # the book, without any one day's chapters
    summary: str
    sittings: int  # times sat with it, from the reading log (see digest.sittings_behind)


class DigestOut(BaseModel):
    """A built digest. `html`/`text` are the rendered email; preview returns them
    without sending so the prompt and layout can be tuned for free."""
    day: str
    subject: str
    highlights: list[str]
    recall: list[RecallOut]
    thread: ThreadOut | None = None
    html: str
    text: str


class DigestSendOut(BaseModel):
    """What became of one day's digest."""
    day: str
    status: str  # sent | skipped | failed
    detail: str  # why, when it wasn't sent
    highlight_count: int


class DailyQuoteOut(BaseModel):
    """One line surfaced on Status today, rotating by the date — either a pull-quote
    from a capture or one of its takeaways."""
    text: str
    source_title: str
    insight_id: str
    # True when the video said this; False when it's a distilled takeaway. Only the
    # former may be shown in quotation marks — quoting a paraphrase invents a speaker.
    verbatim: bool = True


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
    created_at: datetime  # when it was jotted — the day band the client files it under
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
    bucket: str | None = None          # 'needs' | 'wants'; null = untagged spending
    commitment_id: str | None = None   # set when logged by paying a standing commitment


class MoneyOut(BaseModel):
    """The money *summary* for the tracker headline — today and this ISO week's
    in/out, plus the all-time balance. Entries live at /money/history (per period),
    so /state stays small however much history accrues."""
    today_in: float
    today_out: float
    week_in: float
    week_out: float
    balance: float  # money remaining — all time in minus out


class CommitmentOut(BaseModel):
    """One standing monthly commitment — a worksheet line item and a bill at once."""
    id: str
    label: str
    amount: float
    bucket: Literal["needs", "wants"]
    due_day: int      # day of the month, 0 = no fixed date
    variable: bool    # an allowance (groceries) rather than a fixed bill
    active: bool      # inactive rows keep their history without counting
    paid_this_month: bool  # already logged this month, so it's off the due list


class BudgetActualOut(BaseModel):
    """What actually moved this month. `income` is everything that came in (the
    take-home entry plus any extra) — the figure the 50/30/20 lines divide, so the
    rule follows real money rather than a stored setting. `untagged` is spending from
    before the budget existed — reported as itself rather than folded into a bucket it
    was never assigned to."""
    income: float
    needs: float
    wants: float
    untagged: float


class BudgetTodayOut(BaseModel):
    """Loose spending logged *today* against each bucket — the day-sized line.

    Standing bills are excluded on purpose: rent is already planned in the
    commitments, so counting the day it's paid against a daily allowance would
    read as a blowout on a day nothing unusual happened."""
    needs: float
    wants: float


class BudgetOut(BaseModel):
    """The budget as stored: take-home pay, the commitments it's divided across, and
    this month's actual spending. Deliberately *raw* — targets, totals and the
    derived savings figure are computed on the client (src/lib/budget.ts) so the
    worksheet can recalculate as you type and the formulas never exist in two places
    that could disagree."""
    monthly_income: float   # 0 = not set yet; the worksheet's empty state
    start_month: str        # 'YYYY-MM' the budget began, '' before income is set
    month: str              # the 'YYYY-MM' the actuals below cover
    commitments: list[CommitmentOut]
    actual: BudgetActualOut
    today: BudgetTodayOut


class MoneyBucketOut(BaseModel):
    day: str
    earned: float
    spent: float


class MoneyHistoryOut(BaseModel):
    """One period (day / week / month) of the money log — entries, per-day buckets
    for the chart, and earned/spent/net totals."""
    scope: str
    start: str
    end: str
    earned: float
    spent: float
    net: float
    buckets: list[MoneyBucketOut]
    entries: list[MoneyEntryOut]


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
    updated_at: datetime  # last edit (or created_at) — the Journal sorts by this


class StateOut(BaseModel):
    player: PlayerOut
    stats: list[StatOut]
    streak: StreakOut
    today: TodayOut
    book_review: BookReviewOut
    craft: CraftOut
    reading: ReadingOut | None  # progress on the current book, or null when none set
    week_review: WeekReviewOut  # a gentle recap of the current ISO week
    next_rank: RankGateOut | None
    preferences: dict[str, list[str]]
    levels: dict[str, str]
    progression: dict[str, ProgressionOut]  # per-attribute earned difficulty (STR, INT, …)
    llm_enabled: bool  # true when a Gemini key is configured (quests are personalised)
    transcript_enabled: bool  # true when a Supadata key is set (Inspire capture is on)
    digest_enabled: bool  # true when Resend is configured (the Recall email can send)
    daily_quote: DailyQuoteOut | None  # a rotating pull-quote from captured videos
    quests: list[QuestOut]
    priorities: list[PriorityOut]  # self-set focuses pinned on top of the plan, one per attribute
    achievements: list[AchievementOut]
    record: RecordOut
    reminders: list[ReminderOut]  # a plain personal list shown on Status
    grocery: list[GroceryOut]  # things to buy — ticked off once bought
    money: MoneyOut  # the money log (in/out) + today/this-week totals, on You
    budget: BudgetOut  # take-home pay + standing commitments, for the 50/30/20 worksheet
    journal: list[JournalEntryOut]  # free-form daily entries, newest first
    reflections: list[ReflectionOut]  # quest-linked takeaways, newest first
    learnings: list[LearningOut]  # what you logged reading/learning today
    recall: list[RecallOut]  # older highlights coming back around, on an expanding ladder
    thread: ThreadOut | None = None  # the running summary of the book you're reading


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
