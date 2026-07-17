import { DAILY_CLEAR_ID, questById } from '@/data/quests';
import type { Completion } from '@/types';

import { dateKey, daysBetween, shiftKey, weekKey, weekKeyOfDateKey } from './dates';

/** The full history: 'YYYY-MM-DD' -> completions that day. */
export type CompletionLog = Record<string, Completion[]>;

export function countToday(log: CompletionLog, questId: string): number {
  return (log[dateKey()] ?? []).filter((c) => c.questId === questId).length;
}

export function countThisWeek(log: CompletionLog, questId: string): number {
  const week = weekKey();
  let n = 0;
  for (const [day, entries] of Object.entries(log)) {
    if (weekKeyOfDateKey(day) !== week) continue;
    n += entries.filter((c) => c.questId === questId).length;
  }
  return n;
}

export function countAll(log: CompletionLog, questId: string): number {
  let n = 0;
  for (const entries of Object.values(log)) {
    n += entries.filter((c) => c.questId === questId).length;
  }
  return n;
}

/** Real quest completions (the daily-clear bonus entry doesn't count). */
export function totalCompletions(log: CompletionLog): number {
  let n = 0;
  for (const entries of Object.values(log)) {
    n += entries.filter((c) => c.questId !== DAILY_CLEAR_ID).length;
  }
  return n;
}

export function sideCompletions(log: CompletionLog): number {
  let n = 0;
  for (const entries of Object.values(log)) {
    n += entries.filter((c) => questById(c.questId)?.cadence === 'side').length;
  }
  return n;
}

/** Days on which all five daily quests were cleared. */
export function dailyClears(log: CompletionLog): number {
  let n = 0;
  for (const entries of Object.values(log)) {
    if (entries.some((c) => c.questId === DAILY_CLEAR_ID)) n += 1;
  }
  return n;
}

export function xpOnDay(log: CompletionLog, day: string): number {
  return (log[day] ?? []).reduce((sum, c) => sum + c.xp, 0);
}

/** Days with at least one completion, oldest first. */
export function activeDayKeys(log: CompletionLog): string[] {
  return Object.keys(log)
    .filter((day) => (log[day] ?? []).length > 0)
    .sort();
}

/**
 * Consecutive active days ending today — or ending yesterday, so the streak
 * isn't shown as broken before you've had a chance to act today.
 */
export function currentStreak(log: CompletionLog): number {
  const days = new Set(activeDayKeys(log));
  let day = dateKey();
  if (!days.has(day)) day = shiftKey(day, -1);
  let streak = 0;
  while (days.has(day)) {
    streak += 1;
    day = shiftKey(day, -1);
  }
  return streak;
}

/** Longest run of consecutive active days ever — used for rank gates. */
export function maxStreak(log: CompletionLog): number {
  const days = activeDayKeys(log);
  let best = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && daysBetween(days[i - 1], days[i]) === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}
