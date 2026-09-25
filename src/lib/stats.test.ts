import { describe, expect, it } from 'vitest';

import { isStatShown } from '@/lib/stats';
import { STAT_KEYS } from '@/types';

describe('isStatShown', () => {
  it('hides only Craft while Craft is parked', () => {
    expect(STAT_KEYS.filter((k) => !isStatShown(k, true))).toEqual(['CFT']);
  });

  it('shows every attribute once Craft is dealt again', () => {
    expect(STAT_KEYS.every((k) => isStatShown(k, false))).toBe(true);
  });
});
