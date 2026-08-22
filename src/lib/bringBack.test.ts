import { describe, expect, it } from 'vitest';

import type { ApiInsight, ApiRecall } from '@/lib/api';
import { buildBringBack } from '@/lib/bringBack';

function recall(id: string): ApiRecall {
  return { id, text: `answer ${id}`, cue: `cue ${id}`, hook: '', day: '2026-08-01', source_label: 'Book', days_ago: 5 };
}

function insight(over: Partial<ApiInsight>): ApiInsight {
  return {
    id: 'i1', source_url: 'u', source: 'youtube', kind: 'tips', title: 'YouTube', summary: 's',
    takeaways: [], steps: [], quotes: [], created_at: '2026-08-01', ...over,
  };
}

describe('buildBringBack', () => {
  it('puts every due recall item before any tip', () => {
    const out = buildBringBack(
      [recall('a'), recall('b')],
      [insight({ takeaways: ['idea'], steps: ['do it'] })],
    );
    expect(out.map((x) => x.kind)).toEqual(['recall', 'recall', 'tip', 'tip']);
  });

  it('takes both halves of a tips capture, flagging actions apart from ideas', () => {
    const out = buildBringBack([], [insight({ takeaways: ['an idea'], steps: ['an action'] })]);
    expect(out).toEqual([
      { kind: 'tip', id: 'i1-t0', text: 'an idea', source: 'YouTube', action: false },
      { kind: 'tip', id: 'i1-s0', text: 'an action', source: 'YouTube', action: true },
    ]);
  });

  it('ignores motivation captures — those feed the daily line, not this', () => {
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

  it('is empty when nothing is due and nothing has been captured', () => {
    expect(buildBringBack([], [])).toEqual([]);
  });
});
