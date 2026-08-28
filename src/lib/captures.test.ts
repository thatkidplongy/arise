import { describe, expect, it } from 'vitest';

import type { ApiCaptureSweep, ApiInsight } from '@/lib/api';
import { REASON_LABELS, describeAttempts, summariseSweep } from '@/lib/captures';

function sweep(over: Partial<ApiCaptureSweep> = {}): ApiCaptureSweep {
  return { captured: [], failed: 0, untried: 0, remaining: [], ...over };
}

function insight(id: string): ApiInsight {
  return {
    id,
    source_url: `https://youtu.be/${id}`,
    source: 'youtube',
    kind: 'motivation',
    title: '@x',
    summary: 's',
    takeaways: [],
    steps: [],
    quotes: [],
    created_at: '2026-08-26T00:00:00Z',
  };
}

describe('describeAttempts', () => {
  it('reads as prose for the first try', () => {
    expect(describeAttempts(1)).toBe('Tried once');
    expect(describeAttempts(0)).toBe('Tried once'); // never rendered, never wrong either
  });

  it('counts from the second', () => {
    expect(describeAttempts(2)).toBe('Tried 2×');
    expect(describeAttempts(11)).toBe('Tried 11×');
  });
});

describe('summariseSweep', () => {
  it('names what landed', () => {
    expect(summariseSweep(sweep({ captured: [insight('a'), insight('b')] }))).toBe('2 distilled.');
  });

  it('never hides what a bounded sweep left behind', () => {
    // The whole point of the line: five of twenty went through, and the other
    // fifteen must not read as done.
    const out = summariseSweep(sweep({ captured: [insight('a')], failed: 2, untried: 15 }));
    expect(out).toBe('1 distilled · 2 still failing · 15 left to try.');
  });

  it('drops the parts that are zero', () => {
    expect(summariseSweep(sweep({ failed: 3 }))).toBe('3 still failing.');
    expect(summariseSweep(sweep({ untried: 4 }))).toBe('4 left to try.');
  });

  it('says so plainly when there was nothing to sweep', () => {
    expect(summariseSweep(sweep())).toBe('Nothing to try.');
  });
});

describe('REASON_LABELS', () => {
  it('covers every reason the server can file a link under', () => {
    // Mirrors insights.RETRYABLE_REASONS plus no_speech — a missing key here would
    // render an empty card title.
    expect(Object.keys(REASON_LABELS).sort()).toEqual([
      'distill_failed',
      'failed',
      'fetch_failed',
      'no_key',
      'no_speech',
    ]);
  });
});
