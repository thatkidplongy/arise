"""Achievement definitions: pure predicates over a progress snapshot."""

from dataclasses import dataclass, field
from typing import Callable


@dataclass
class Snapshot:
    total_xp: int
    level: int
    stat_levels: dict[str, int]
    max_streak: int
    daily_clears: int
    total_completions: int
    side_completions: int
    quest_counts: dict[str, int] = field(default_factory=dict)

    def count_of(self, quest_id: str) -> int:
        return self.quest_counts.get(quest_id, 0)


@dataclass
class AchievementDef:
    id: str
    name: str
    desc: str
    check: Callable[[Snapshot], bool]
    title_reward: str | None = None


ACHIEVEMENTS: list[AchievementDef] = [
    AchievementDef(
        id="first-quest",
        name="First Step",
        desc="Complete your first quest.",
        title_reward="The Awakened",
        check=lambda s: s.total_completions >= 1,
    ),
    AchievementDef(
        id="perfect-day",
        name="Perfect Day",
        desc="Clear all daily quests in a single day.",
        title_reward="Diligent One",
        check=lambda s: s.daily_clears >= 1,
    ),
    AchievementDef(
        id="clears-7",
        name="Relentless",
        desc="Clear all daily quests on 7 different days.",
        check=lambda s: s.daily_clears >= 7,
    ),
    AchievementDef(
        id="streak-7",
        name="Iron Will",
        desc="Reach a 7-day activity streak.",
        title_reward="Iron-Willed",
        check=lambda s: s.max_streak >= 7,
    ),
    AchievementDef(
        id="streak-30",
        name="Unbreakable",
        desc="Reach a 30-day activity streak.",
        title_reward="The Unbreakable",
        check=lambda s: s.max_streak >= 30,
    ),
    AchievementDef(
        id="badminton-10",
        name="Court Regular",
        desc="Complete 10 badminton raids.",
        check=lambda s: s.count_of("w-badminton") >= 10,
    ),
    AchievementDef(
        id="badminton-50",
        name="Shuttlecock Slayer",
        desc="Complete 50 badminton raids.",
        title_reward="Shuttlecock Slayer",
        check=lambda s: s.count_of("w-badminton") >= 50,
    ),
    AchievementDef(
        id="level-10",
        name="Second Awakening",
        desc="Reach Level 10.",
        check=lambda s: s.level >= 10,
    ),
    AchievementDef(
        id="level-25",
        name="Beyond the Gate",
        desc="Reach Level 25.",
        check=lambda s: s.level >= 25,
    ),
    AchievementDef(
        id="side-10",
        name="Wanderer",
        desc="Complete 10 side quests.",
        title_reward="Curious Explorer",
        check=lambda s: s.side_completions >= 10,
    ),
    AchievementDef(
        id="stat-10",
        name="Limit Break",
        desc="Raise any attribute to level 10.",
        title_reward="Limit Breaker",
        check=lambda s: any(lvl >= 10 for lvl in s.stat_levels.values()),
    ),
    AchievementDef(
        id="wealth-5",
        name="Seed Capital",
        desc="Raise Wealth to level 5.",
        title_reward="The Enterprising",
        check=lambda s: s.stat_levels.get("WLT", 0) >= 5,
    ),
    AchievementDef(
        id="craft-5",
        name="Journeyman",
        desc="Raise Craft to level 5.",
        title_reward="The Craftsman",
        check=lambda s: s.stat_levels.get("CFT", 0) >= 5,
    ),
    AchievementDef(
        id="craft-15",
        name="Architect",
        desc="Raise Craft to level 15.",
        title_reward="The Architect",
        check=lambda s: s.stat_levels.get("CFT", 0) >= 15,
    ),
    AchievementDef(
        id="xp-1000",
        name="Mana Reservoir",
        desc="Earn 1,000 total XP.",
        check=lambda s: s.total_xp >= 1000,
    ),
]
