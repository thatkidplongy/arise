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


class PreferencesIn(BaseModel):
    # {stat: [focus, ...]}; the full set per attribute. Empty list clears it.
    preferences: dict[str, list[str]]


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


class StatOut(BaseModel):
    key: str
    level: int
    into: int
    needed: int


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
    next_rank: RankGateOut | None
    preferences: dict[str, list[str]]
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
