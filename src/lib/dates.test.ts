import { describe, expect, it } from 'vitest';

import { recentDays } from '@/lib/dates';

describe('recentDays', () => {
  it('counts back from today, most recent first', () => {
    expect(recentDays('2026-08-22', 4)).toEqual(['2026-08-22', '2026-08-21', '2026-08-20', '2026-08-19']);
  });

  it('crosses a month boundary without inventing a day', () => {
    expect(recentDays('2026-09-02', 4)).toEqual(['2026-09-02', '2026-09-01', '2026-08-31', '2026-08-30']);
  });

  it('crosses a year boundary', () => {
    expect(recentDays('2027-01-01', 3)).toEqual(['2027-01-01', '2026-12-31', '2026-12-30']);
  });

  it('handles a leap day', () => {
    expect(recentDays('2028-03-01', 3)).toEqual(['2028-03-01', '2028-02-29', '2028-02-28']);
  });

  it('is empty for a nonsense day or a count below one', () => {
    expect(recentDays('', 7)).toEqual([]);
    expect(recentDays('yesterday', 7)).toEqual([]);
    expect(recentDays('2026-08-22', 0)).toEqual([]);
  });
});
