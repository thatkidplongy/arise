import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .db import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_id() -> str:
    return uuid.uuid4().hex


class Player(Base):
    __tablename__ = "players"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String, default="Hunter")
    equipped_title: Mapped[str | None] = mapped_column(String, nullable=True)
    # The life / person the hunter is reaching for — their reason, kept in view.
    north_star: Mapped[str] = mapped_column(String, default="")
    # Reading loop: read at your own pace, then log what you actually got through
    # (see ReadingLog). A book runs for as many weeks as it takes — a week ending
    # never resets it. current_book is what they're reading now; once the logged
    # chapters reach the book's length, the app checks in ("did you finish?") and,
    # if so, rolls to the next. current_book_chapters is the finish line, not a quota.
    current_book: Mapped[str] = mapped_column(String, default="")
    current_book_chapters: Mapped[int] = mapped_column(Integer, default=0)  # 0 = unknown
    books_finished: Mapped[int] = mapped_column(Integer, default=0)
    book_started_week: Mapped[str] = mapped_column(String, default="")  # ISO week set (paces progress)
    book_review_week: Mapped[str] = mapped_column(String, default="")  # ISO week the check-in last fired
    # Progression begins the week this is first set (see progression.py), so past
    # history never counts retroactively — everyone starts each attribute at Lv 0.
    progression_start_week: Mapped[str] = mapped_column(String, default="")
    # The ISO week Japanese study began — anchors the phased learning plan
    # (kana → grammar → kanji). Set the first time we see the player.
    japanese_started_week: Mapped[str] = mapped_column(String, default="")
    # The ISO week the system-design plan began — kept for display ("started 3 weeks
    # ago"), never to decide what to study. The phase advances on reading, not time.
    craft_started_week: Mapped[str] = mapped_column(String, default="")
    # Which phase of the system-design plan is current (1-based). It moves when the
    # hunter says the phase is done — never on a schedule. A calendar-driven plan is
    # the same mistake as a chapters-per-day quota: it turns a slow week into a
    # failure and marches you past material you haven't read.
    craft_phase: Mapped[int] = mapped_column(Integer, default=1)
    # The day the current phase began, so 'how far into this phase' counts only the
    # study logged since it started.
    craft_phase_day: Mapped[str] = mapped_column(String, default="")
    # The ISO week the phase check-in last fired, so it asks at most once a week.
    craft_review_week: Mapped[str] = mapped_column(String, default="")
    # The one thing currently being studied — "DDIA ch 5 — Replication", a Notion
    # page, a chapter. Craft's equivalent of current_book, and for the same reason: a
    # quest that names three sources at once is a scavenger hunt, not a sitting. The
    # phase says what this stretch is about; this says what's open in front of you.
    craft_source: Mapped[str] = mapped_column(String, default="")
    # How many of the current phase's pieces have been ticked off. Deliberately not
    # derived from the notes logged: a hard chapter can take three sittings, and
    # counting sittings would read those as three chapters covered. Saying a piece is
    # finished is a separate act from saying you sat with it.
    craft_piece: Mapped[int] = mapped_column(Integer, default=0)
    # Craft (CFT): when on, the coding attribute's quests shift to interview prep —
    # timed DSA, mock system design, behavioural stories. Off → steady craft growth.
    interview_mode: Mapped[bool] = mapped_column(Boolean, default=False)
    # Self-set priorities that sit on top of the plan, one per attribute (e.g.
    # STR → "abs" this week). JSON: {stat: {focus, scope, period}} where scope is
    # 'day' | 'week' | 'open' and period is the day or ISO week it was set, so a
    # day/week priority expires on its own. '{}' = nothing pinned.
    priorities: Mapped[str] = mapped_column(String, default="{}")
    # Monthly take-home pay, the base the 50/30/20 lines are computed from. 0 = not
    # set yet, which is what the worksheet's empty state keys off. The three targets
    # are always derived from this, never stored, so they can't drift out of step.
    monthly_income: Mapped[float] = mapped_column(Float, default=0)
    # The month the budget began ('YYYY-MM'), so spending logged before there was a
    # budget is never retro-sorted into buckets it was never tagged with.
    budget_start_month: Mapped[str] = mapped_column(String, default="")
    # Optional profile picture as a small data-URI (base64). Kept OUT of the main
    # /state payload (only `has_avatar` is exposed there); fetched on its own route.
    avatar: Mapped[str] = mapped_column(String, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QuestDef(Base):
    """Quest definitions live in the database — add a row, the app picks it up."""

    __tablename__ = "quest_defs"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # slug, e.g. 'd-train'
    title: Mapped[str] = mapped_column(String)
    desc: Mapped[str] = mapped_column(String)
    stat: Mapped[str] = mapped_column(String)  # STR | CRE | SPI | CHA | INT | WLT | CFT
    xp: Mapped[int] = mapped_column(Integer)
    cadence: Mapped[str] = mapped_column(String)  # daily | weekly | side
    target: Mapped[int] = mapped_column(Integer, default=1)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort: Mapped[int] = mapped_column(Integer, default=0)


class Completion(Base):
    """The source of truth. XP totals, streaks and achievements all derive from here."""

    __tablename__ = "completions"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"))
    quest_id: Mapped[str] = mapped_column(String)  # quest slug, or 'daily-clear' bonus
    xp: Mapped[int] = mapped_column(Integer)
    day: Mapped[str] = mapped_column(String, index=True)  # client-local 'YYYY-MM-DD'
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AchievementUnlock(Base):
    __tablename__ = "achievement_unlocks"

    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    achievement_id: Mapped[str] = mapped_column(String, primary_key=True)
    unlocked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Preference(Base):
    """Optional per-attribute focus. When set, it themes that stat's side quest."""

    __tablename__ = "preferences"

    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    stat: Mapped[str] = mapped_column(String, primary_key=True)  # STR | CRE | SPI | CHA | INT | WLT | CFT
    focus: Mapped[str] = mapped_column(String)
    # Optional "where I'm at" note for this attribute (e.g. "Math: fractions").
    # Feeds the LLM so it can prescribe the next step; ignored when the LLM is off.
    level: Mapped[str] = mapped_column(String, default="")


class StepCheck(Base):
    """A ticked step within a quest, scoped to the period it belongs to. Presence
    of a row means that step is checked. Cleared when the quest completes or its
    completion is undone."""

    __tablename__ = "step_checks"

    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    quest_id: Mapped[str] = mapped_column(String, primary_key=True)
    period_key: Mapped[str] = mapped_column(String, primary_key=True)  # day or ISO week
    step_index: Mapped[int] = mapped_column(Integer, primary_key=True)


class BodyProfile(Base):
    """One-time body inputs for the calorie/protein calculator (see nutrition.py).
    Targets are derived on read, never stored — the same derive-on-read contract
    as the rest of the app."""

    __tablename__ = "body_profiles"

    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    sex: Mapped[str] = mapped_column(String, default="unspecified")  # male | female | unspecified
    age: Mapped[int] = mapped_column(Integer, default=0)
    height_cm: Mapped[int] = mapped_column(Integer, default=0)
    weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    activity: Mapped[str] = mapped_column(String, default="moderate")
    goal: Mapped[str] = mapped_column(String, default="maintain")
    goal_weight_kg: Mapped[float] = mapped_column(Float, default=0.0)  # 0 = not set
    country: Mapped[str] = mapped_column(String, default="")  # "" = worldwide; "PH" localises food picks


class FoodEntry(Base):
    """One logged food for a day. The daily total is summed from these rows; there
    is no 'budget exceeded' state — the tracker informs, it never punishes."""

    __tablename__ = "food_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    day: Mapped[str] = mapped_column(String, index=True)  # client-local 'YYYY-MM-DD'
    name: Mapped[str] = mapped_column(String)
    grams: Mapped[int] = mapped_column(Integer, default=0)  # 0 = a serving / unspecified
    kcal: Mapped[int] = mapped_column(Integer, default=0)
    protein_g: Mapped[int] = mapped_column(Integer, default=0)
    fibre_g: Mapped[int] = mapped_column(Integer, default=0)
    at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class SkincareStep(Base):
    """One step of a player's AM or PM routine — seeded from skincare.TEMPLATE on
    first use, then fully editable. Deactivated rather than deleted so history of
    ticks stays coherent."""

    __tablename__ = "skincare_steps"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    routine: Mapped[str] = mapped_column(String)  # AM | PM
    text: Mapped[str] = mapped_column(String)
    sort: Mapped[int] = mapped_column(Integer, default=0)
    active: Mapped[bool] = mapped_column(Boolean, default=True)


class SkincareCheck(Base):
    """Presence of a row means that step was done that day (like StepCheck)."""

    __tablename__ = "skincare_checks"

    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    step_id: Mapped[str] = mapped_column(String, primary_key=True)
    day: Mapped[str] = mapped_column(String, primary_key=True)


class GeneratedQuest(Base):
    """LLM-personalised content for a slot in a period, cached so we generate at
    most once per slot per period. Absent row → fall back to the handcrafted
    pool. The mandatory floor (reading chapter, push-ups…) is always re-applied
    in code on top of this, so personalisation can't drop a non-negotiable."""

    __tablename__ = "generated_quests"

    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    quest_id: Mapped[str] = mapped_column(String, primary_key=True)
    period_key: Mapped[str] = mapped_column(String, primary_key=True)  # day or ISO week
    title: Mapped[str] = mapped_column(String)
    desc: Mapped[str] = mapped_column(String)
    steps: Mapped[str] = mapped_column(String)  # JSON list of step strings
    resource: Mapped[str] = mapped_column(String, default="")


class Insight(Base):
    """A motivational video the hunter captured: its spoken transcript, distilled
    by the LLM into takeaways + pull-quotes. Quotes resurface on Status as a gentle
    nudge. Stored, not derived — fetched once when captured, then kept."""

    __tablename__ = "insights"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    source_url: Mapped[str] = mapped_column(String)
    source: Mapped[str] = mapped_column(String, default="web")  # tiktok|instagram|youtube|web
    # What kind of capture: 'motivation' (quotes + a daily nudge) or 'tips' (a
    # practical playbook of steps). Drives which Gemini prompt distils it and where
    # it lands in the Inspire tab. Only motivation quotes feed the Status nudge.
    kind: Mapped[str] = mapped_column(String, default="motivation")
    title: Mapped[str] = mapped_column(String, default="")  # @handle / short label
    summary: Mapped[str] = mapped_column(String, default="")
    takeaways: Mapped[str] = mapped_column(String, default="[]")  # JSON list: the kept lessons
    steps: Mapped[str] = mapped_column(String, default="[]")  # JSON list: optional actions (tips)
    quotes: Mapped[str] = mapped_column(String, default="[]")  # JSON list of strings
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Reminder(Base):
    """A personal to-do the hunter jots on Status — check it off when done. Done
    items stay (with when they were finished), so the list is also a record. No
    scheduling, no notifications; it just informs."""

    __tablename__ = "reminders"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    text: Mapped[str] = mapped_column(String)
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QuestNote(Base):
    """What the hunter wrote to complete a quest's write-step — a takeaway, an
    idea, a line to keep. Scoped to the quest's period (day for dailies, ISO week
    for weekly/side) and dated, so the Journal reads back by date. `step_index`
    binds it to the step that produced it, so undoing that step removes the note
    (the reflection *is* the step's answer, not an independent journal entry)."""

    __tablename__ = "quest_notes"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    quest_id: Mapped[str] = mapped_column(String)  # quest slug, e.g. 'd-wealth'
    period_key: Mapped[str] = mapped_column(String)  # day or ISO week the note belongs to
    day: Mapped[str] = mapped_column(String, index=True)  # client-local 'YYYY-MM-DD'
    text: Mapped[str] = mapped_column(String)
    prompt: Mapped[str] = mapped_column(String, default="")  # the write-step/question this answers
    step_index: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)  # the step it answers
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class JournalEntry(Base):
    """A free-form daily journal entry — anything the hunter wants to note for the
    day, tied to no quest. Markdown, dated, kept forever. Distinct from QuestNote
    (which is a takeaway earned by completing a reflective quest)."""

    __tablename__ = "journal_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    day: Mapped[str] = mapped_column(String, index=True)  # client-local 'YYYY-MM-DD'
    text: Mapped[str] = mapped_column(String)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Bumped on every edit; the Journal list sorts by this so freshly-edited entries
    # surface to the top (falls back to created_at for rows written before this).
    updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class GroceryItem(Base):
    """Something to buy — tick it once it's in the basket. Bought items stay (with
    when they were bought), so the list doubles as a record of what you got. No
    scheduling, no weekly reset; just add, buy, tidy up when you like."""

    __tablename__ = "grocery_items"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    name: Mapped[str] = mapped_column(String)
    bought: Mapped[bool] = mapped_column(Boolean, default=False)
    bought_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class MoneyEntry(Base):
    """One line in the money log — an amount in (income) or out (spending) with a
    short note, on the day it happened. The You tab totals today and this week from
    these, and the wealth daily's 'log spending' step points here so there's a real
    place to record it."""

    __tablename__ = "money_entries"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    amount: Mapped[float] = mapped_column(Float)  # always positive; direction carries the sign
    direction: Mapped[str] = mapped_column(String)  # 'in' (income) | 'out' (spending)
    note: Mapped[str] = mapped_column(String, default="")
    day: Mapped[str] = mapped_column(String, index=True)  # client-local 'YYYY-MM-DD'
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    # Which 50/30/20 bucket this spending counted against — 'needs' | 'wants', or
    # NULL for anything logged before there was a budget. Left NULL deliberately on
    # old rows: sorting months of past spending into buckets it was never tagged
    # with would be invention, so untagged entries are reported as untagged.
    bucket: Mapped[str | None] = mapped_column(String, nullable=True)
    # Set when this entry was logged by paying a standing commitment, which is how
    # "is rent paid this month?" is answered without the user typing rent twice.
    commitment_id: Mapped[str | None] = mapped_column(String, nullable=True, index=True)


class BudgetCommitment(Base):
    """One standing monthly commitment — rent, internet, a grocery allowance. These
    are the worksheet's line items: a bill you owe every month and a planned row in
    the budget are the same fact, so recording it once serves both.

    `bucket` is 'needs' or 'wants' (never 'savings' — savings is what's left over,
    not something you commit to spending). `variable` marks an allowance whose real
    amount moves month to month, like groceries: `amount` is then what you're
    planning for rather than a figure you'll be billed."""

    __tablename__ = "budget_commitments"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    label: Mapped[str] = mapped_column(String)
    amount: Mapped[float] = mapped_column(Float)  # planned pesos per month, always positive
    bucket: Mapped[str] = mapped_column(String)  # 'needs' | 'wants'
    due_day: Mapped[int] = mapped_column(Integer, default=0)  # day of month, 0 = no fixed date
    variable: Mapped[bool] = mapped_column(Boolean, default=False)  # an allowance, not a fixed bill
    active: Mapped[bool] = mapped_column(Boolean, default=True)  # off keeps history without counting
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Learning(Base):
    """One thing the hunter read or learned — a couple of chapters, a Notion page,
    something that landed at work. What they *now know*, as opposed to JournalEntry,
    which is how the day *felt*; keeping them apart means the digest reads like
    knowledge rather than a diary.

    `source` is a free label ("Atomic Habits, ch 5-6", a URL). `text` is optional:
    naming the source is enough on a busy day, and the distiller works from the
    name alone for a book it knows."""

    __tablename__ = "learnings"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    day: Mapped[str] = mapped_column(String, index=True)  # client-local 'YYYY-MM-DD'
    kind: Mapped[str] = mapped_column(String, default="other")  # book|notion|article|work|video|other
    source: Mapped[str] = mapped_column(String, default="")  # what it was — title, page, URL
    text: Mapped[str] = mapped_column(String, default="")  # optional notes in their own words
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ReadingLog(Base):
    """One sitting of reading, in the hunter's own units — "ch 5–7", 3 chapters.

    The app doesn't set a chapters-per-day quota; it asks what was actually read and
    counts that toward the book. `chapters` is the count progress is measured in;
    `label` is what they typed ("5–7", "the intro"), kept verbatim so the digest can
    name real chapters instead of guessing. `book` is the title as it stood when
    logged, so changing books never inherits the last one's progress."""

    __tablename__ = "reading_logs"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    day: Mapped[str] = mapped_column(String, index=True)  # client-local 'YYYY-MM-DD'
    book: Mapped[str] = mapped_column(String, default="")
    chapters: Mapped[int] = mapped_column(Integer, default=1)
    label: Mapped[str] = mapped_column(String, default="")  # which ones, verbatim
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Highlight(Base):
    """One distilled line worth keeping — the unit of recall. A day's learnings are
    distilled into a handful of these once, then they're reread: tomorrow's digest,
    and again days and weeks later. Dated, because that date is the whole mechanism
    behind spaced repetition.

    `learning_id` is NULL when the highlight came from something derived rather than
    logged (a reading daily ticked with no note attached)."""

    __tablename__ = "highlights"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    day: Mapped[str] = mapped_column(String, index=True)  # the day it was learned
    learning_id: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    text: Mapped[str] = mapped_column(String)
    # The question whose answer is `text`. Being asked and briefly failing beats being
    # told — so the email leads with this and keeps `text` below the fold.
    cue: Mapped[str] = mapped_column(String, default="")
    # A memory hook, and only for arbitrary material (names, ordered lists, numbers).
    # Deliberately empty for conceptual ideas, where a mnemonic gets in the way of
    # the understanding that would carry them anyway.
    hook: Mapped[str] = mapped_column(String, default="")
    source_label: Mapped[str] = mapped_column(String, default="")  # where it came from, for display
    # Leitner: which rung of the ladder this sits on, and the day it comes back.
    # Being shown advances the box on its own, so never grading anything reproduces
    # the plain expanding ladder; grading only pulls a shaky one back down.
    box: Mapped[int] = mapped_column(Integer, default=0)
    due: Mapped[str] = mapped_column(String, default="", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Thread(Base):
    """A running one-sentence summary of everything read from one source so far.

    Borrowed from the marginalia method: you summarise each new paragraph, but you
    also keep recondensing *everything before it* into a single sentence. That second
    sentence is the work — fitting a growing pile of ideas into one line forces you to
    decide what actually matters and how the pieces connect, which is the part that
    produces understanding rather than a pile of disconnected notes.

    Here a day of reading plays the part of a paragraph. One row per source, rewritten
    each day that source is read; `key` is the source name with chapter markers
    stripped, so 'Deep Work, ch 2' and 'Deep Work' are the same thread."""

    __tablename__ = "threads"

    id: Mapped[str] = mapped_column(String, primary_key=True, default=new_id)
    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), index=True)
    key: Mapped[str] = mapped_column(String, index=True)  # normalised source name
    title: Mapped[str] = mapped_column(String)  # as last written, for display
    summary: Mapped[str] = mapped_column(String, default="")
    days: Mapped[int] = mapped_column(Integer, default=0)  # days folded in so far
    day: Mapped[str] = mapped_column(String, default="")  # last day folded in
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class DigestRun(Base):
    """A record that the digest for one day has been dealt with — at most one per
    day, keyed on it. A manual send and the scheduled 7am job can't double-email,
    and a failed run leaves `status`/`detail` behind to explain itself."""

    __tablename__ = "digest_runs"

    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    day: Mapped[str] = mapped_column(String, primary_key=True)  # the day being recapped
    status: Mapped[str] = mapped_column(String, default="sent")  # sent | skipped | failed
    detail: Mapped[str] = mapped_column(String, default="")  # why, when it wasn't sent
    highlight_count: Mapped[int] = mapped_column(Integer, default=0)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
