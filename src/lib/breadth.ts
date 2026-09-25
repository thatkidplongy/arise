import type { ApiState } from '@/lib/api';

/**
 * One line under the experience bar saying how much of today's XP counts toward
 * the level. The server weighs each day by the attributes it touched
 * (game.BREADTH_FROM), so a day spent on Intelligence alone still pays every card
 * but only moves the level by a share. Null when there's nothing to say: no XP yet
 * today, or a day from before the rule began.
 */
export function describeBreadth(today: ApiState['today']): string | null {
  const { breadth, xp } = today;
  if (!breadth.applies || xp <= 0 || breadth.of === 0) return null;
  const areas = `${breadth.touched} of ${breadth.of} attributes today`;
  if (breadth.touched >= breadth.of) return `${areas} · all ${xp} XP counts toward your level`;
  return `${areas} · ${breadth.level_xp} of ${xp} XP counts toward your level`;
}
