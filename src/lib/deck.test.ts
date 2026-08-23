import { describe, expect, it } from 'vitest';

import type { ApiRecall } from '@/lib/api';
import type { BringBack } from '@/lib/bringBack';
import {
  ALL_PILE,
  EMPTY_DECK,
  currentEntry,
  deckFor,
  listStacks,
  meetCard,
  missCard,
  restartPile,
  stackOf,
} from '@/lib/deck';

function card(id: string, material = 'A book'): BringBack {
  const item: ApiRecall = {
    id, text: `answer ${id}`, cue: `cue ${id}`, hook: '', day: '2026-08-01',
    source_label: material, material, chapter: '', seen: 0, own_words: false,
    origin: '', if_missed: 1, if_shaky: 3, if_got: 7, days_ago: 5,
  };
  return { kind: 'recall', id, item };
}

function tip(id: string, source = 'A video'): BringBack {
  return { kind: 'tip', id, text: `tip ${id}`, cue: `cue ${id}`, source, platform: 'YouTube', day: '2026-08-01', action: false };
}

describe('deckFor', () => {
  it('keeps the day’s own state and resets any other morning’s', () => {
    const stored = { day: '2026-08-23', met: ['a'], deferred: { b: 2 }, ticks: 3 };
    expect(deckFor('2026-08-23', stored)).toEqual({ met: ['a'], deferred: { b: 2 }, ticks: 3 });
    expect(deckFor('2026-08-24', stored)).toEqual(EMPTY_DECK);
  });
});

describe('listStacks', () => {
  it('names each material once, in the order the deck first shows it', () => {
    const items = [card('a', 'Book one'), tip('t', 'A video'), card('b', 'Book one'), card('c', 'Book two')];
    expect(listStacks(items, [], []).map((m) => m.name)).toEqual(['Book one', 'A video', 'Book two']);
  });

  it('counts a stack every way its picker row says it', () => {
    const items = [card('a', 'Book one'), card('b', 'Book one'), card('c', 'Book one')];
    expect(listStacks(items, ['a'], ['a', 'b'])).toEqual([
      { name: 'Book one', total: 3, left: 2, due: 2, dueLeft: 1 },
    ]);
  });

  it('leaves unlabeled cards off the list — they live only in the all-pile', () => {
    expect(listStacks([card('a', '')], [], [])).toEqual([]);
  });
});

describe('stackOf', () => {
  it('counts the whole deck for the all-pile, unlabeled cards included', () => {
    const items = [card('a', 'Book one'), card('b', '')];
    expect(stackOf(items, ['a'], ['a'], ALL_PILE)).toEqual({
      name: ALL_PILE, total: 2, left: 1, due: 1, dueLeft: 0,
    });
  });

  it('counts one material alone when the pile names it', () => {
    const items = [card('a', 'Book one'), card('b', 'Book two')];
    expect(stackOf(items, [], ['b'], 'Book two')).toEqual({
      name: 'Book two', total: 1, left: 1, due: 1, dueLeft: 1,
    });
  });
});

describe('currentEntry', () => {
  it('shows the first unmet card of the chosen pile', () => {
    const items = [card('a', 'Book one'), card('b', 'Book two'), card('c', 'Book two')];
    expect(currentEntry(items, ALL_PILE, EMPTY_DECK)?.id).toBe('a');
    expect(currentEntry(items, 'Book two', EMPTY_DECK)?.id).toBe('b');
    expect(currentEntry(items, 'Book two', meetCard(EMPTY_DECK, 'b'))?.id).toBe('c');
  });

  it('is null once every card in the pile is met — the pile has an end', () => {
    const state = meetCard(meetCard(EMPTY_DECK, 'a'), 'b');
    expect(currentEntry([card('a'), card('b')], ALL_PILE, state)).toBeNull();
  });

  it('brings a missed card back after a few others, like the physical pile', () => {
    const items = [card('a'), card('b'), card('c'), card('d'), card('e')];
    let state = missCard(EMPTY_DECK, 'a');
    expect(currentEntry(items, ALL_PILE, state)?.id).toBe('b');
    state = meetCard(state, 'b');
    state = meetCard(state, 'c');
    expect(currentEntry(items, ALL_PILE, state)?.id).toBe('d');
    state = meetCard(state, 'd');
    expect(currentEntry(items, ALL_PILE, state)?.id).toBe('a');
  });

  it('shows a still-deferred card rather than ending the pile with cards unasked', () => {
    const items = [card('a'), card('b')];
    const state = meetCard(missCard(EMPTY_DECK, 'a'), 'b');
    expect(currentEntry(items, ALL_PILE, state)?.id).toBe('a');
  });
});

describe('meetCard and missCard', () => {
  it('meeting is idempotent — a grade landing after a tap changes nothing', () => {
    const once = meetCard(EMPTY_DECK, 'a');
    expect(meetCard(once, 'a').met).toEqual(['a']);
  });

  it('missing un-meets a card — tapped past or not, it still owes today an answer', () => {
    const state = missCard(meetCard(EMPTY_DECK, 'a'), 'a');
    expect(state.met).toEqual([]);
    expect(state.deferred.a).toBeGreaterThan(state.ticks);
  });

  it('meeting a previously missed card clears its return', () => {
    const state = meetCard(missCard(EMPTY_DECK, 'a'), 'a');
    expect(state.deferred).toEqual({});
    expect(state.met).toEqual(['a']);
  });
});

describe('restartPile', () => {
  it('puts one pile’s cards back without touching the other piles’ day', () => {
    const items = [card('a', 'Book one'), card('b', 'Book two')];
    const state = meetCard(meetCard(EMPTY_DECK, 'a'), 'b');
    const out = restartPile(state, items, 'Book one');
    expect(out.met).toEqual(['b']);
    expect(currentEntry(items, 'Book one', out)?.id).toBe('a');
  });
});
