import { describe, expect, it } from 'vitest';

import type { ApiState } from '@/lib/api';
import { activeBoss, bossesFrom, phasesFor, type Boss } from '@/lib/bosses';

function boss(over: Partial<Boss>): Boss {
  return {
    id: 'b',
    name: 'B',
    how: '',
    title: null,
    done: 0,
    target: 10,
    unit: 'days',
    sealed: false,
    phases: [],
    ...over,
  };
}

/** Just enough state for the counters the bosses read. */
function state(over: Partial<ApiState> = {}): ApiState {
  return {
    player: { level: 8, rank: 'E' },
    streak: { current: 2, best: 7 },
    record: { active_days: 24, total_completions: 87, xp: 1710, days_cleared: 6, top_stat: 'STR' },
    stats: [{ key: 'CFT' }, { key: 'WLT' }],
    progression: { CFT: { peak: 4 }, WLT: { peak: 2 } },
    achievements: [],
    ...over,
  } as unknown as ApiState;
}

describe('phasesFor', () => {
  it('walks quarters of the way, then the whole way', () => {
    expect(phasesFor(30, 0, 'days').map((p) => p.at)).toEqual([8, 15, 23, 30]);
  });

  it('marks a phase cleared once the count reaches it', () => {
    expect(phasesFor(7, 4, 'days').map((p) => p.cleared)).toEqual([true, true, false, false]);
  });

  it('collapses duplicate marks rather than repeating a short boss', () => {
    // A target of 1 rounds every quarter to the same mark.
    expect(phasesFor(1, 0, 'days')).toHaveLength(1);
  });
});

describe('bossesFrom', () => {
  it('scores an achievement on the counter it is actually measured by', () => {
    const [b] = bossesFrom(
      state({
        achievements: [
          { id: 'streak-30', name: 'Unbreakable', desc: 'Reach a 30-day streak.', unlocked_at: null, title_reward: 'The Unbreakable' },
        ] as ApiState['achievements'],
      }),
    );
    expect(b).toMatchObject({ done: 7, target: 30, sealed: false, title: 'The Unbreakable' });
  });

  it('leaves out achievements whose counter the state does not expose', () => {
    const bosses = bossesFrom(
      state({
        achievements: [
          { id: 'badminton-50', name: 'Slayer', desc: '', unlocked_at: null, title_reward: null },
        ] as ApiState['achievements'],
      }),
    );
    expect(bosses).toEqual([]);
  });

  it('never reports more progress than the boss asks for', () => {
    const [b] = bossesFrom(
      state({
        record: { active_days: 0, total_completions: 0, xp: 99999, days_cleared: 0, top_stat: null },
        achievements: [
          { id: 'xp-1000', name: 'Mana Reservoir', desc: '', unlocked_at: null, title_reward: null },
        ] as ApiState['achievements'],
      }),
    );
    expect(b.done).toBe(1000);
  });
});

describe('activeBoss', () => {
  it('leads with the one you are furthest into', () => {
    const picked = activeBoss([boss({ id: 'a', done: 2 }), boss({ id: 'b', done: 8 })]);
    expect(picked?.id).toBe('b');
  });

  it('breaks a tie toward the shorter boss', () => {
    const picked = activeBoss([
      boss({ id: 'long', done: 15, target: 30 }),
      boss({ id: 'short', done: 5, target: 10 }),
    ]);
    expect(picked?.id).toBe('short');
  });

  it('ignores the ones already sealed', () => {
    expect(activeBoss([boss({ done: 10, sealed: true })])).toBeUndefined();
  });
});
