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
    # Reading loop: one book a week, a chapter a day. current_book is what they're
    # reading now; at each new week the app asks if it's finished and what's next.
    current_book: Mapped[str] = mapped_column(String, default="")
    current_book_chapters: Mapped[int] = mapped_column(Integer, default=0)  # 0 = unknown
    books_finished: Mapped[int] = mapped_column(Integer, default=0)
    book_started_week: Mapped[str] = mapped_column(String, default="")  # ISO week set
    book_review_week: Mapped[str] = mapped_column(String, default="")  # ISO week last asked
    # Progression begins the week this is first set (see progression.py), so past
    # history never counts retroactively — everyone starts each attribute at Lv 0.
    progression_start_week: Mapped[str] = mapped_column(String, default="")
    # The ISO week Japanese study began — anchors the phased learning plan
    # (kana → grammar → kanji). Set the first time we see the player.
    japanese_started_week: Mapped[str] = mapped_column(String, default="")
    # Craft (CFT): when on, the coding attribute's quests shift to interview prep —
    # timed DSA, mock system design, behavioural stories. Off → steady craft growth.
    interview_mode: Mapped[bool] = mapped_column(Boolean, default=False)
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
