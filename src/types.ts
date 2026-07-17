export type StatKey = 'STR' | 'CRE' | 'SPI' | 'CHA' | 'INT';

export type Rank = 'E' | 'D' | 'C' | 'B' | 'A' | 'S';

export type Cadence = 'daily' | 'weekly' | 'side';

export interface QuestDef {
  id: string;
  title: string;
  desc: string;
  stat: StatKey;
  xp: number;
  cadence: Cadence;
  /** Times it can be completed per period (per day for daily/side, per ISO week for weekly). */
  target: number;
}

export interface Completion {
  questId: string;
  xp: number;
  at: string; // ISO timestamp
}

/** A queued System pop-up (level up, rank up, achievement...). */
export interface Notice {
  id: string;
  title: string;
  lines: string[];
}

/** Read-only view of progress used by achievement checks. */
export interface Snapshot {
  totalXp: number;
  level: number;
  statLevels: Record<StatKey, number>;
  maxStreak: number;
  dailyClears: number;
  totalCompletions: number;
  sideCompletions: number;
  countOf: (questId: string) => number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  /** Equippable title granted on unlock, if any. */
  titleReward?: string;
  check: (s: Snapshot) => boolean;
}
