import { describe, expect, it } from 'vitest';

import type { ApiRecall } from '@/lib/api';
import type { BringBack } from '@/lib/bringBack';
import {
  ALL_PILE,
  EMPTY_DECK,
  currentEntry,
  deckFor,
  listMaterials,
  meetCard,
  missCard,
  pileProgress,
  restartPile,
} from '@/lib/deck';

function card(id: string, material = 'A book'): BringBack {
  const item: ApiRecall = {
    id, text: `answer ${id}`, cue: `cue ${id}`, hook: '', day: '2026-08-01',
    source_label: material, material, days_ago: 5,
  };
  return { kind: 'recall', id, item };
}

function tip(id: string, source = 'A video'): BringBack {
  return { kind: 'tip', id, text: `tip ${id}`, source, action: false };
}

describe('deckFor', () => {
  it('keeps the day’s own state and resets any other morning’s', () => {
    const stored = { day: '2026-08-23', met: ['a'], deferred: { b: 2 }, ticks: 3 };
    expect(deckFor('2026-08-23', stored)).toEqual({ met: ['a'], deferred: { b: 2 }, ticks: 3 });
    expect(deckFor('2026-08-24', stored)).toEqual(EMPTY_DECK);
  });
});

describe('listMaterials', () => {
  it('names each material once, in the order the deck first shows it', () => {
    const items = [card('a', 'Book one'), tip('t', 'A video'), card('b', 'Book one'), card('c', 'Book two')];
    expect(listMaterials(items, []).map((m) => m.name)).toEqual(['Book one', 'A video', 'Book two']);
  });

  it('counts only the cards still unmet', () => {
    const items = [card('a', 'Book one'), card('b', 'Book one')];
    expect(listMaterials(items, ['a'])).toEqual([{ name: 'Book one', left: 1 }]);
  });

  it('leaves unlabeled cards off the list — they live only in the all-pile', () => {
    expect(listMaterials([card('a', '')], [])).toEqual([]);
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

describe('pileProgress', () => {
  it('counts the chosen pile only', () => {
    const items = [card('a', 'Book one'), card('b', 'Book two')];
    expect(pileProgress(items, 'Book one', ['a'])).toEqual({ done: 1, total: 1 });
    expect(pileProgress(items, ALL_PILE, ['a'])).toEqual({ done: 1, total: 2 });
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
