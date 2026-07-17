import type { Rank } from '@/types';

/** XP needed to go from `level` to `level + 1`. Gentle start, steady ramp. */
export function xpToNext(level: number): number {
  return 80 + (level - 1) * 40;
}

export interface LevelInfo {
  level: number;
  /** XP earned within the current level. */
  into: number;
  /** XP required to finish the current level. */
  needed: number;
}

export function levelInfo(totalXp: number): LevelInfo {
  let level = 1;
  let rest = totalXp;
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level += 1;
  }
  return { level, into: rest, needed: xpToNext(level) };
}

/** Stats level on a cheaper curve than the hunter level, so they move visibly. */
export function statXpToNext(level: number): number {
  return 50 + (level - 1) * 30;
}

export function statLevelInfo(xp: number): LevelInfo {
  let level = 1;
  let rest = xp;
  while (rest >= statXpToNext(level)) {
    rest -= statXpToNext(level);
    level += 1;
  }
  return { level, into: rest, needed: statXpToNext(level) };
}

export interface RankGate {
  rank: Rank;
  level: number;
  /** Best-ever streak required — rank rewards consistency, not grinding. */
  streak: number;
}

export const RANK_GATES: RankGate[] = [
  { rank: 'E', level: 1, streak: 0 },
  { rank: 'D', level: 10, streak: 7 },
  { rank: 'C', level: 20, streak: 14 },
  { rank: 'B', level: 32, streak: 21 },
  { rank: 'A', level: 46, streak: 30 },
  { rank: 'S', level: 60, streak: 50 },
];

export function rankFor(level: number, maxStreak: number): Rank {
  let current: Rank = 'E';
  for (const gate of RANK_GATES) {
    if (level >= gate.level && maxStreak >= gate.streak) current = gate.rank;
  }
  return current;
}

/** The first gate not yet satisfied, or null once S-rank is reached. */
export function nextGate(level: number, maxStreak: number): RankGate | null {
  return RANK_GATES.find((g) => level < g.level || maxStreak < g.streak) ?? null;
}
