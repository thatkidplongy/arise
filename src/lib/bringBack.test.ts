import { describe, expect, it } from 'vitest';

import type { ApiInsight, ApiRecall } from '@/lib/api';
import { buildBringBack, buildTipCue, topicOf } from '@/lib/bringBack';

function recall(id: string): ApiRecall {
  return {
    id, text: `answer ${id}`, cue: `cue ${id}`, hook: '', day: '2026-08-01',
    source_label: 'Book', material: 'Book', chapter: '', seen: 0, own_words: false,
    origin: '', if_missed: 1, if_shaky: 3, if_got: 7, days_ago: 5,
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
      {
        kind: 'tip', id: 'i1-t0', text: 'an idea', cue: 'The YouTube video — what did it actually say?',
        source: 'Tips \u00b7 YouTube', platform: 'YouTube', day: '2026-08-01', action: false,
      },
      {
        kind: 'tip', id: 'i1-s0', text: 'an action', cue: 'The YouTube video — what did it say to actually do?',
        source: 'Tips \u00b7 YouTube', platform: 'YouTube', day: '2026-08-01', action: true,
      },
    ]);
  });

  it('files tips under their capture, so the shelf tells a playbook from a book', () => {
    const out = buildBringBack([], [insight({ title: '@moneyguy', takeaways: ['an idea'] })]);
    expect(out[0]).toMatchObject({ source: 'Tips \u00b7 @moneyguy' });
  });

  it('takes the saved day off the capture timestamp, however precise it arrived', () => {
    const out = buildBringBack([], [insight({ created_at: '2026-08-02T09:14:00Z', takeaways: ['t'] })]);
    expect(out[0]).toMatchObject({ day: '2026-08-02' });
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

describe('topicOf', () => {
  it('drops the run-up a summary opens with — the subject is what follows it', () => {
    expect(topicOf('A breakdown of why rational money plans fail.')).toBe('why rational money plans fail');
    expect(topicOf('This video explains compound interest.')).toBe('compound interest');
    expect(topicOf('The clip breaks down sinking funds.')).toBe('sinking funds');
  });

  it('keeps only the first sentence — the second is elaboration, not the subject', () => {
    expect(topicOf('Sinking funds, explained. He also covers debt.')).toBe('sinking funds, explained');
  });

  it('lowercases an opening word but leaves an acronym or a name alone', () => {
    expect(topicOf('Index funds beat stock picking')).toBe('index funds beat stock picking');
    expect(topicOf('ETFs versus managed funds')).toBe('ETFs versus managed funds');
  });

  it('gives nothing back when the summary will not shorten into a phrase', () => {
    expect(topicOf('')).toBe('');
    expect(topicOf('   ')).toBe('');
    expect(topicOf('A '.repeat(60))).toBe('');
  });
});

describe('buildTipCue', () => {
  it('names the platform the tip was captured from', () => {
    expect(buildTipCue('', 'youtube', false)).toBe('The YouTube video — what did it actually say?');
    expect(buildTipCue('', 'tiktok', false)).toBe('The TikTok clip — what did it actually say?');
    expect(buildTipCue('', 'instagram', false)).toBe('The Instagram clip — what did it actually say?');
  });

  it('falls back to a saved page for a source it has no name for', () => {
    expect(buildTipCue('', 'web', false)).toBe('The page you saved — what did it actually say?');
    expect(buildTipCue('', 'whatever', false)).toBe('The page you saved — what did it actually say?');
  });

  it('asks a step what you meant to do, and an idea what it said', () => {
    expect(buildTipCue('This video explains sinking funds.', 'youtube', true)).toBe(
      'The YouTube video on sinking funds — what did it say to actually do?',
    );
    expect(buildTipCue('This video explains sinking funds.', 'youtube', false)).toBe(
      'The YouTube video on sinking funds — what did it actually say?',
    );
  });

  it('never leaks the tip itself — the cue is built from the capture, not the answer', () => {
    const cue = buildTipCue('A breakdown of budgeting.', 'youtube', false);
    expect(cue).not.toContain('Pay yourself first');
  });
});
