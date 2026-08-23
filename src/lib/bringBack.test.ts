import { describe, expect, it } from 'vitest';

import type { ApiInsight, ApiRecall } from '@/lib/api';
import { buildBringBack } from '@/lib/bringBack';

function recall(id: string): ApiRecall {
  return {
    id, text: `answer ${id}`, cue: `cue ${id}`, hook: '', day: '2026-08-01',
    source_label: 'Book', material: 'Book', days_ago: 5,
  };
}

function insight(over: Partial<ApiInsight>): ApiInsight {
  return {
    id: 'i1', source_url: 'u', source: 'youtube', kind: 'tips', title: 'YouTube', summary: 's',
    takeaways: [], steps: [], quotes: [], created_at: '2026-08-01', ...over,
  };
}

describe('buildBringBack', () => {
  it('puts every due highlight before any tip, so tapping through meets the work first', () => {
    const out = buildBringBack(
      [recall('a'), recall('b')],
      [insight({ takeaways: ['idea'], steps: ['do it'] })],
    );
    expect(out.map((x) => x.kind)).toEqual(['recall', 'recall', 'tip', 'tip']);
  });

  it('keeps the schedule’s own ordering of the due items', () => {
    const out = buildBringBack([recall('a'), recall('b'), recall('c')], []);
    expect(out.map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('takes both halves of a tips capture, flagging actions apart from ideas', () => {
    const out = buildBringBack([], [insight({ takeaways: ['an idea'], steps: ['an action'] })]);
    expect(out).toEqual([
      { kind: 'tip', id: 'i1-t0', text: 'an idea', source: 'YouTube', action: false },
      { kind: 'tip', id: 'i1-s0', text: 'an action', source: 'YouTube', action: true },
    ]);
  });

  it('ignores motivation captures — those feed the daily line, not this screen', () => {
    const out = buildBringBack([], [insight({ kind: 'motivation', takeaways: ['t'], quotes: ['q'] })]);
    expect(out).toEqual([]);
  });

  it('gives every entry a distinct id, so two captures cannot collide as list keys', () => {
    const out = buildBringBack(
      [recall('a')],
      [
        insight({ id: 'x', takeaways: ['one', 'two'], steps: ['three'] }),
        insight({ id: 'y', takeaways: ['one'], steps: [] }),
      ],
    );
    const ids = out.map((x) => x.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toEqual(['a', 'x-t0', 'x-t1', 'x-s0', 'y-t0']);
  });

  it('works with only one side present, and is empty with neither', () => {
    expect(buildBringBack([recall('a')], []).map((x) => x.kind)).toEqual(['recall']);
    expect(buildBringBack([], [insight({ takeaways: ['idea'] })]).map((x) => x.kind)).toEqual(['tip']);
    expect(buildBringBack([], [])).toEqual([]);
  });

  it('puts the library after the tips — the shelf can be hundreds long, so anything behind it would never be reached', () => {
    const out = buildBringBack(
      [recall('due')],
      [insight({ takeaways: ['idea'] })],
      [recall('old-1'), recall('old-2')],
    );
    expect(out.map((x) => x.id)).toEqual(['due', 'i1-t0', 'old-1', 'old-2']);
  });

  it('drops library entries already owed today, so a due question is met once up front', () => {
    const out = buildBringBack([recall('a')], [], [recall('a'), recall('b')]);
    expect(out.map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('keeps the library in the order it arrived — the server owns the day’s shuffle', () => {
    const out = buildBringBack([], [], [recall('c'), recall('a'), recall('b')]);
    expect(out.map((x) => x.id)).toEqual(['c', 'a', 'b']);
  });
});
