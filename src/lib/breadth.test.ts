import { describe, expect, it } from 'vitest';

import type { ApiState } from '@/lib/api';
import { describeBreadth } from '@/lib/breadth';

function today(xp: number, touched: number, of: number, levelXp: number, applies = true): ApiState['today'] {
  return {
    day: '2026-09-28',
    xp,
    dailies_done: 0,
    dailies_total: 5,
    cleared: false,
    resting: false,
    breadth: { touched, of, level_xp: levelXp, applies },
  };
}

describe('describeBreadth', () => {
  it('says how much of a one-attribute day counts', () => {
    expect(describeBreadth(today(75, 1, 3, 25))).toBe('1 of 3 attributes today · 25 of 75 XP counts toward your level');
  });

  it('says all of it counts once every attribute is touched', () => {
    expect(describeBreadth(today(155, 3, 3, 155))).toBe('3 of 3 attributes today · all 155 XP counts toward your level');
  });

  it('stays quiet with nothing earned yet, or before the rule began', () => {
    expect(describeBreadth(today(0, 0, 3, 0))).toBeNull();
    expect(describeBreadth(today(75, 1, 3, 75, false))).toBeNull();
  });
});
