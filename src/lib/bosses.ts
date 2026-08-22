import type { ApiState } from '@/lib/api';
import type { StatKey } from '@/types';

/**
 * Boss fights: the long milestones, with the phases you've already cleared shown
 * along the way. They never expire and they never punish — drift away from one and
 * it sits where you left it, phases intact.
 *
 * Nothing new is stored for these. Each boss is one of the server's own
 * achievements, paired here with the counter that achievement is actually measured
 * against, so the progress on screen is the same number the server will unlock it
 * on. An achievement whose counter the state payload doesn't expose (the badminton
 * raids, the side-quest tally) is deliberately absent rather than guessed at.
 */
export interface BossPhase {
  at: number;
  label: string;
  cleared: boolean;
}

export interface Boss {
  id: string;
  name: string;
  /** The achievement's own wording for what it asks. */
  how: string;
  /** The title it equips when it seals, or null when it only marks the record. */
  title: string | null;
  done: number;
  target: number;
  unit: string;
  sealed: boolean;
  phases: BossPhase[];
}

type Counter = { target: number; unit: string; of: (s: ApiState) => number };

const peak = (s: ApiState, key: StatKey) => s.progression?.[key]?.peak ?? 0;

/** Achievement id -> the counter it is scored on. Ids come from the server. */
const COUNTERS: Record<string, Counter> = {
  'clears-7': { target: 7, unit: 'days cleared', of: (s) => s.record.days_cleared },
  'streak-7': { target: 7, unit: 'days running', of: (s) => s.streak.best },
  'streak-30': { target: 30, unit: 'days running', of: (s) => s.streak.best },
  'level-10': { target: 10, unit: 'levels', of: (s) => s.player.level },
  'level-25': { target: 25, unit: 'levels', of: (s) => s.player.level },
  'stat-10': {
    target: 10,
    unit: 'levels',
    of: (s) => Math.max(0, ...s.stats.map((st) => peak(s, st.key))),
  },
  'wealth-5': { target: 5, unit: 'levels', of: (s) => peak(s, 'WLT') },
  'craft-5': { target: 5, unit: 'levels', of: (s) => peak(s, 'CFT') },
  'craft-15': { target: 15, unit: 'levels', of: (s) => peak(s, 'CFT') },
  'xp-1000': { target: 1000, unit: 'XP', of: (s) => s.record.xp },
};

/**
 * Quarters of the way, then the whole way. Rounded and de-duplicated, so a short
 * boss gets two phases rather than four identical ones.
 */
export function phasesFor(target: number, done: number, unit: string): BossPhase[] {
  const marks = [0.25, 0.5, 0.75, 1]
    .map((f) => Math.max(1, Math.round(target * f)))
    .filter((at, i, all) => all.indexOf(at) === i);
  return marks.map((at) => ({ at, label: `${at.toLocaleString()} ${unit}`, cleared: done >= at }));
}

/** Every boss the state can actually score, newest progress first. */
export function bossesFrom(state: ApiState): Boss[] {
  return state.achievements
    .filter((a) => COUNTERS[a.id] != null)
    .map((a) => {
      const counter = COUNTERS[a.id];
      const done = Math.max(0, counter.of(state));
      return {
        id: a.id,
        name: a.name,
        how: a.desc,
        title: a.title_reward,
        done: Math.min(done, counter.target),
        target: counter.target,
        unit: counter.unit,
        sealed: a.unlocked_at != null,
        phases: phasesFor(counter.target, done, counter.unit),
      };
    });
}

/**
 * The one to lead with: the unsealed boss you're furthest into. Ties go to the
 * shorter one, so the next thing to finish is the thing on top.
 */
export function activeBoss(bosses: Boss[]): Boss | undefined {
  const open = bosses.filter((b) => !b.sealed);
  if (open.length === 0) return undefined;
  return open.reduce((best, b) => {
    const bf = b.done / b.target;
    const bestF = best.done / best.target;
    if (bf !== bestF) return bf > bestF ? b : best;
    return b.target < best.target ? b : best;
  });
}
