import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
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
    books_finished: Mapped[int] = mapped_column(Integer, default=0)
    book_started_week: Mapped[str] = mapped_column(String, default="")  # ISO week set
    book_review_week: Mapped[str] = mapped_column(String, default="")  # ISO week last asked
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class QuestDef(Base):
    """Quest definitions live in the database — add a row, the app picks it up."""

    __tablename__ = "quest_defs"

    id: Mapped[str] = mapped_column(String, primary_key=True)  # slug, e.g. 'd-train'
    title: Mapped[str] = mapped_column(String)
    desc: Mapped[str] = mapped_column(String)
    stat: Mapped[str] = mapped_column(String)  # STR | CRE | SPI | CHA | INT | WLT
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
    stat: Mapped[str] = mapped_column(String, primary_key=True)  # STR | CRE | SPI | CHA | INT | WLT
    focus: Mapped[str] = mapped_column(String)


class StepCheck(Base):
    """A ticked step within a quest, scoped to the period it belongs to. Presence
    of a row means that step is checked. Cleared when the quest completes or its
    completion is undone."""

    __tablename__ = "step_checks"

    player_id: Mapped[str] = mapped_column(ForeignKey("players.id"), primary_key=True)
    quest_id: Mapped[str] = mapped_column(String, primary_key=True)
    period_key: Mapped[str] = mapped_column(String, primary_key=True)  # day or ISO week
    step_index: Mapped[int] = mapped_column(Integer, primary_key=True)
