import { describe, expect, it } from 'vitest';

import {
  dayMonth,
  formatClock,
  formatDayBand,
  formatDayChip,
  formatDayInline,
  monthToDate,
  recentDays,
  toUtcIso,
  weekdayDay,
} from '@/lib/dates';

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

describe('weekdayDay', () => {
  it('names the weekday and day of the month', () => {
    expect(weekdayDay('2026-08-23')).toBe('Sun 23');
    expect(weekdayDay('2026-08-22')).toBe('Sat 22');
  });

  it('passes nonsense through untouched', () => {
    expect(weekdayDay('yesterday')).toBe('yesterday');
  });
});

describe('formatDayBand', () => {
  it('leads with Today and Yesterday, then lets the weekday carry it', () => {
    expect(formatDayBand('2026-08-23', '2026-08-23')).toBe('Today · Sun 23');
    expect(formatDayBand('2026-08-22', '2026-08-23')).toBe('Yesterday · Sat 22');
    expect(formatDayBand('2026-08-21', '2026-08-23')).toBe('Fri 21');
  });

  it('names the month once the day leaves this one, so two 23rds can be told apart', () => {
    expect(formatDayBand('2026-07-23', '2026-08-23')).toBe('Thu 23 Jul');
    expect(formatDayBand('2025-08-23', '2026-08-23')).toBe('Sat 23 Aug');
  });
});

describe('toUtcIso', () => {
  it('marks a naive server stamp as the UTC it is', () => {
    expect(toUtcIso('2026-08-22 12:40:53.421532')).toBe('2026-08-22T12:40:53.421532Z');
    expect(toUtcIso('2026-08-22T12:40:53')).toBe('2026-08-22T12:40:53Z');
  });

  it('leaves an already-zoned stamp alone', () => {
    expect(toUtcIso('2026-08-22T12:40:53Z')).toBe('2026-08-22T12:40:53Z');
    expect(toUtcIso('2026-08-22T12:40:53+08:00')).toBe('2026-08-22T12:40:53+08:00');
    expect(toUtcIso('2026-08-22T12:40:53-0500')).toBe('2026-08-22T12:40:53-0500');
  });
});

describe('formatClock', () => {
  it('reads the wall-clock in the ledger voice', () => {
    expect(formatClock(new Date(2026, 7, 23, 9, 12))).toBe('9:12 am');
    expect(formatClock(new Date(2026, 7, 23, 23, 59))).toBe('11:59 pm');
  });

  it('keeps noon and midnight on the twelve', () => {
    expect(formatClock(new Date(2026, 7, 23, 0, 5))).toBe('12:05 am');
    expect(formatClock(new Date(2026, 7, 23, 12, 0))).toBe('12:00 pm');
  });

  it('says nothing for a time that never parsed', () => {
    expect(formatClock(new Date('nonsense'))).toBe('');
  });
});

describe('dayMonth', () => {
  it('wears the day first and drops the year', () => {
    expect(dayMonth('2026-08-14')).toBe('14 Aug');
  });

  it('hands back what it cannot parse', () => {
    expect(dayMonth('not-a-day')).toBe('not-a-day');
  });
});

describe('formatDayInline', () => {
  it('lowercases the relative days so they read as prose', () => {
    expect(formatDayInline('2026-08-23', '2026-08-23')).toBe('today');
    expect(formatDayInline('2026-08-22', '2026-08-23')).toBe('yesterday');
  });

  it('words a dated day exactly as its chip and band do', () => {
    expect(formatDayInline('2026-08-21', '2026-08-23')).toBe('Fri 21');
    expect(formatDayInline('2026-07-30', '2026-08-02')).toBe('Thu 30 Jul');
  });
});

describe('formatDayChip', () => {
  it('keeps the relative days, then borrows the band wording', () => {
    expect(formatDayChip('2026-08-23', '2026-08-23')).toBe('Today');
    expect(formatDayChip('2026-08-22', '2026-08-23')).toBe('Yesterday');
    expect(formatDayChip('2026-08-21', '2026-08-23')).toBe('Fri 21');
  });

  it('names the month once the strip reaches back into the last one', () => {
    expect(formatDayChip('2026-07-30', '2026-08-02')).toBe('Thu 30 Jul');
  });
});

describe('monthToDate', () => {
  it('reaches back to the 1st and no further', () => {
    expect(monthToDate('2026-08-03')).toEqual(['2026-08-03', '2026-08-02', '2026-08-01']);
    expect(monthToDate('2026-08-01')).toEqual(['2026-08-01']);
  });

  it('covers a long month without leaving it', () => {
    const days = monthToDate('2026-08-31');
    expect(days).toHaveLength(31);
    expect(days[0]).toBe('2026-08-31');
    expect(days[30]).toBe('2026-08-01');
  });

  it('is empty for a day it cannot read', () => {
    expect(monthToDate('nonsense')).toEqual([]);
  });
});
