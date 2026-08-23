import { describe, expect, it } from 'vitest';

import { groupByDay } from '@/lib/dayGroups';

const TODAY = '2026-08-23';

interface Row {
  day: string;
  label: string;
}

const dayOf = (r: Row) => r.day;

describe('groupByDay', () => {
  it('bands by day, newest first', () => {
    const rows: Row[] = [
      { day: '2026-08-21', label: 'a' },
      { day: '2026-08-22', label: 'b' },
      { day: '2026-08-21', label: 'c' },
    ];
    expect(groupByDay(rows, dayOf, TODAY).map((g) => [g.day, g.items.map((i) => i.label)])).toEqual([
      ['2026-08-23', []],
      ['2026-08-22', ['b']],
      ['2026-08-21', ['a', 'c']],
    ]);
  });

  it('keeps today even when nothing lands on it', () => {
    expect(groupByDay([], dayOf, TODAY)).toEqual([{ day: TODAY, items: [] }]);
  });

  it('leaves the order inside a band exactly as given', () => {
    const rows: Row[] = [
      { day: TODAY, label: 'first' },
      { day: TODAY, label: 'second' },
    ];
    expect(groupByDay(rows, dayOf, TODAY)[0].items.map((i) => i.label)).toEqual(['first', 'second']);
  });

  it('sorts a day after today above it, rather than dropping it', () => {
    const rows: Row[] = [{ day: '2026-08-25', label: 'ahead' }];
    expect(groupByDay(rows, dayOf, TODAY).map((g) => g.day)).toEqual(['2026-08-25', '2026-08-23']);
  });
});
