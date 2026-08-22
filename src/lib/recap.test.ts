import { describe, expect, it } from 'vitest';

import type { ApiHistoryItem } from '@/lib/api';
import { inWeek, recapFor, weekLabel, weekOf } from '@/lib/recap';

function done(day: string, stat: string, xp = 10): ApiHistoryItem {
  return { id: `${day}-${stat}-${xp}`, quest_id: 'q', title: 't', stat, cadence: 'daily', xp, day, at: '' };
}

describe('weekOf', () => {
  it('starts the week on Monday', () => {
    // 2026-08-22 is a Saturday.
    expect(weekOf('2026-08-22')).toEqual({ start: '2026-08-17', end: '2026-08-23' });
  });

  it('keeps Sunday in the week that began six days earlier', () => {
    expect(weekOf('2026-08-23').start).toBe('2026-08-17');
  });

  it('treats a Monday as its own first day', () => {
    expect(weekOf('2026-08-17').start).toBe('2026-08-17');
  });

  it('steps back a whole week at a time', () => {
    expect(weekOf('2026-08-22', -1)).toEqual({ start: '2026-08-10', end: '2026-08-16' });
  });

  it('crosses a month boundary without drifting', () => {
    expect(weekOf('2026-09-01')).toEqual({ start: '2026-08-31', end: '2026-09-06' });
  });
});

describe('inWeek', () => {
  const week = weekOf('2026-08-22');
  it('includes both ends', () => {
    expect(inWeek('2026-08-17', week)).toBe(true);
    expect(inWeek('2026-08-23', week)).toBe(true);
  });
  it('excludes the day either side', () => {
    expect(inWeek('2026-08-16', week)).toBe(false);
    expect(inWeek('2026-08-24', week)).toBe(false);
  });
});

describe('recapFor', () => {
  const week = weekOf('2026-08-22');

  it('counts distinct days, not entries', () => {
    const r = recapFor([done('2026-08-18', 'STR'), done('2026-08-18', 'INT')], week);
    expect(r.days).toBe(1);
    expect(r.quests).toBe(2);
  });

  it('adds the XP the week actually paid', () => {
    expect(recapFor([done('2026-08-18', 'STR', 10), done('2026-08-19', 'INT', 40)], week).xp).toBe(50);
  });

  it('ignores anything outside the week', () => {
    expect(recapFor([done('2026-08-10', 'STR')], week).quests).toBe(0);
  });

  it('names the attribute the week leaned into', () => {
    const r = recapFor(
      [done('2026-08-18', 'STR'), done('2026-08-19', 'STR'), done('2026-08-20', 'INT')],
      week,
    );
    expect(r.leaned).toBe('STR');
  });

  it('leans nowhere on an empty week', () => {
    expect(recapFor([], week).leaned).toBeNull();
  });

  it('always reports all seven attributes, so a quiet one still shows', () => {
    expect(recapFor([done('2026-08-18', 'STR')], week).byStat).toHaveLength(7);
  });

  it('skips an entry whose attribute slug is gone', () => {
    const r = recapFor([done('2026-08-18', '')], week);
    expect(r.quests).toBe(1); // it still happened
    expect(r.byStat.every((s) => s.quests === 0)).toBe(true); // but it belongs to no attribute
  });
});

// The label goes through toLocaleDateString, like every other date in the app, so
// these assert the shape rather than one locale's word order.
describe('weekLabel', () => {
  it('names the month once when the week stays inside it', () => {
    const label = weekLabel({ start: '2026-08-17', end: '2026-08-23' });
    expect(label).toMatch(/17.*–.*23/);
    expect(label.match(/Aug/g)).toHaveLength(1);
  });

  it('names both months when the week straddles them', () => {
    const label = weekLabel({ start: '2026-08-31', end: '2026-09-06' });
    expect(label).toContain('Aug');
    expect(label).toContain('Sep');
  });
});
