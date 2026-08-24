import { describe, expect, it } from 'vitest';

import type { ApiRecall } from '@/lib/api';
import type { BringBack } from '@/lib/bringBack';
import { kanaId } from '@/lib/kana';
import { HIRAGANA } from '@/lib/kanaChart';
import {
  ALL_PILE,
  EMPTY_DECK,
  currentEntry,
  deckFor,
  listStacks,
  meetCard,
  missCard,
  pickShelf,
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

/** A card whose source carried a chapter marker, as the API splits it out. */
function chaptered(id: string, chapter: string, material = 'Book one'): BringBack {
  const entry = card(id, material);
  if (entry.kind === 'recall') entry.item.chapter = chapter;
  return entry;
}

function tip(id: string, source = 'A video'): BringBack {
  return { kind: 'tip', id, text: `tip ${id}`, cue: `cue ${id}`, source, platform: 'YouTube', day: '2026-08-01', action: false };
}

/** A character off the chart, as the deck hands it over. `fresh` is what the shelf
 * counts to say how far through the chart you are. */
function kana(char: string, fresh = true): BringBack {
  const item = HIRAGANA.find((k) => k.char === char);
  if (!item) throw new Error(`${char} is not on the chart`);
  return {
    kind: 'kana',
    id: kanaId(char),
    item: { ...item, box: 0, seen: 0, fresh, due: false, ifMissed: 1, ifShaky: 1, ifGot: 3 },
  };
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
      { name: 'Book one', total: 3, left: 2, due: 2, dueLeft: 1, byline: '3 cards' },
    ]);
  });

  it('writes the byline off the cards — the platform tips came from, the chapters a book covers', () => {
    const chapters = [chaptered('a', 'ch 3'), chaptered('b', 'ch 9-10'), chaptered('c', 'pp 40-52')];
    expect(listStacks(chapters, [], [])[0].byline).toBe('3 cards · ch. 3–10');
    expect(listStacks([tip('t')], [], [])[0].byline).toBe('YouTube · 1 card');
  });

  it('drops the platform when the stack is already named after it', () => {
    expect(listStacks([tip('t', 'Tips · YouTube')], [], [])[0].byline).toBe('1 card');
  });

  it('leaves the span off a book whose sources never name a chapter', () => {
    expect(listStacks([card('a', 'Book one')], [], [])[0].byline).toBe('1 card');
    expect(listStacks([chaptered('a', 'pp 40-52')], [], [])[0].byline).toBe('1 card');
  });

  it('leaves unlabeled cards off the list — they live only in the all-pile', () => {
    expect(listStacks([card('a', '')], [], [])).toEqual([]);
  });
});

describe('pickShelf', () => {
  const shelf = () =>
    listStacks(
      [card('a', 'Due book'), card('b', 'Quiet book'), tip('t', 'Tips · a channel')],
      [],
      ['a'],
    );

  it('shelves only what the schedule is asking for', () => {
    expect(pickShelf(shelf(), '', false).map((s) => s.name)).toEqual(['Due book']);
  });

  it('opens the whole shelf once the reader asks for all of it', () => {
    expect(pickShelf(shelf(), '', true).map((s) => s.name)).toEqual(['Due book', 'Quiet book', 'Tips · a channel']);
  });

  it('searches every material, due or not, on the name or the line under it', () => {
    expect(pickShelf(shelf(), 'quiet', false).map((s) => s.name)).toEqual(['Quiet book']);
    expect(pickShelf(shelf(), 'YOUTUBE', false).map((s) => s.name)).toEqual(['Tips · a channel']);
    expect(pickShelf(shelf(), 'nothing here', false)).toEqual([]);
  });

  it('falls back to the whole shelf on a day with nothing scheduled', () => {
    const quiet = listStacks([card('a', 'Due book'), card('b', 'Quiet book')], [], []);
    expect(pickShelf(quiet, '', false).map((s) => s.name)).toEqual(['Due book', 'Quiet book']);
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

describe('the kana stack on the shelf', () => {
  it('files every character under one stack, whatever row it came from', () => {
    const items = [card('a', 'Book one'), kana('あ'), kana('ぎゃ'), kana('ん')];
    const stacks = listStacks(items, [], []);
    expect(stacks.map((s) => s.name)).toEqual(['Book one', 'Hiragana']);
    expect(stacks[1].total).toBe(3);
  });

  it('says how far through the chart you are, which a book has nothing to say', () => {
    const items = [kana('あ', false), kana('い', false), kana('う')];
    expect(listStacks(items, [], [])[0].byline).toBe('Japanese · 3 cards · 2 learned');
    // A brand-new chart claims no progress rather than claiming none learned.
    expect(listStacks([kana('あ')], [], [])[0].byline).toBe('Japanese · 1 card');
    // A book's stack is a pile of notes you wrote — its size says all there is to say.
    expect(listStacks([card('a', 'Book one')], [], [])[0].byline).toBe('1 card');
  });

  it('is searchable by the track it belongs to, not just its name', () => {
    const stacks = listStacks([kana('あ')], [], []);
    expect(pickShelf(stacks, 'japanese', false).map((s) => s.name)).toEqual(['Hiragana']);
    expect(pickShelf(stacks, 'hiragana', false).map((s) => s.name)).toEqual(['Hiragana']);
  });

  it('walks its own pile without dragging a book’s cards into it', () => {
    const items = [card('a', 'Book one'), kana('あ'), kana('い')];
    const state = { ...EMPTY_DECK };
    expect(currentEntry(items, 'Hiragana', state)?.id).toBe(kanaId('あ'));
    expect(stackOf(items, [], [], 'Hiragana').total).toBe(2);
    expect(stackOf(items, [], [], 'Book one').total).toBe(1);
  });
});
