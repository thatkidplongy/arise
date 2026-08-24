import { describe, expect, it } from 'vitest';

import {
  KANA_NEW_PER_DAY,
  buildKanaDeck,
  countKanaMet,
  gradeKana,
  kanaIntervalFor,
  type KanaBook,
} from '@/lib/kana';

const TODAY = '2026-08-24';

/** A book where `chars` are all sitting on box 1, due on `due`. */
function bookWith(chars: string[], due: string, first = '2026-08-01'): KanaBook {
  return Object.fromEntries(chars.map((char) => [char, { box: 1, due, first, last: first, seen: 1 }]));
}

describe('the ladder', () => {
  it('spaces a character further out the higher it climbs, and stops at the top rung', () => {
    expect([0, 1, 2, 3, 4].map(kanaIntervalFor)).toEqual([1, 3, 7, 16, 35]);
    expect(kanaIntervalFor(9)).toBe(35);
  });

  it('moves a character you knew up a rung, and books it that far out', () => {
    const book = gradeKana({}, 'か', 'got', TODAY);
    expect(book['か']).toEqual({ box: 1, due: '2026-08-27', first: TODAY, last: TODAY, seen: 1 });
  });

  it('drops one you missed to the front of the pile, back tomorrow', () => {
    const book = gradeKana(bookWith(['か'], '2026-08-24'), 'か', 'missed', TODAY);
    expect(book['か'].box).toBe(0);
    expect(book['か'].due).toBe('2026-08-25');
  });

  it('leaves a shaky character where it is — seen again at the same spacing, not further', () => {
    const book = gradeKana(bookWith(['か'], '2026-08-24'), 'か', 'shaky', TODAY);
    expect(book['か'].box).toBe(1);
    expect(book['か'].due).toBe('2026-08-27');
  });

  it('keeps the day it was first met, so the daily intake stays paced', () => {
    const book = gradeKana(bookWith(['か'], '2026-08-24'), 'か', 'got', TODAY);
    expect(book['か'].first).toBe('2026-08-01');
    expect(book['か'].seen).toBe(2);
  });
});

describe('buildKanaDeck', () => {
  it('hands out one row of new characters on a first morning, in chart order', () => {
    const deck = buildKanaDeck({}, TODAY);
    const due = deck.filter((k) => k.due);
    expect(due).toHaveLength(KANA_NEW_PER_DAY);
    expect(due.map((k) => k.char)).toEqual(['あ', 'い', 'う', 'え', 'お']);
    expect(due.every((k) => k.fresh)).toBe(true);
  });

  it('carries the whole chart anyway, so a stack can be drilled early', () => {
    expect(buildKanaDeck({}, TODAY)).toHaveLength(104);
  });

  it('asks for what has come due, oldest first, ahead of the day’s new characters', () => {
    const book = { ...bookWith(['さ'], '2026-08-23'), ...bookWith(['か'], '2026-08-20') };
    const due = buildKanaDeck(book, TODAY).filter((k) => k.due);
    expect(due.slice(0, 2).map((k) => k.char)).toEqual(['か', 'さ']);
    expect(due.slice(2).every((k) => k.fresh)).toBe(true);
  });

  it('leaves a character alone until its day comes round', () => {
    const book = bookWith(['か'], '2026-09-01');
    const asked = buildKanaDeck(book, TODAY).filter((k) => k.due);
    expect(asked.some((k) => k.char === 'か')).toBe(false);
  });

  it('doesn’t shrink the day’s set as you answer it', () => {
    const before = buildKanaDeck({}, TODAY).filter((k) => k.due).length;
    const after = buildKanaDeck(gradeKana({}, 'あ', 'got', TODAY), TODAY).filter((k) => k.due).length;
    expect(after).toBe(before);
  });

  it('stops introducing once the day’s row has been met', () => {
    let book: KanaBook = {};
    for (const char of ['あ', 'い', 'う', 'え', 'お']) book = gradeKana(book, char, 'got', TODAY);
    const due = buildKanaDeck(book, TODAY).filter((k) => k.due);
    expect(due.map((k) => k.char)).toEqual(['あ', 'い', 'う', 'え', 'お']);
    expect(due.some((k) => k.fresh)).toBe(false);
  });

  it('opens the next row the following morning', () => {
    let book: KanaBook = {};
    for (const char of ['あ', 'い', 'う', 'え', 'お']) book = gradeKana(book, char, 'got', TODAY);
    const due = buildKanaDeck(book, '2026-08-25').filter((k) => k.due);
    expect(due.map((k) => k.char)).toEqual(['か', 'き', 'く', 'け', 'こ']);
  });

  it('carries each character’s rung, and what every grade would do to it', () => {
    const deck = buildKanaDeck(bookWith(['か'], '2026-08-24'), TODAY);
    const ka = deck.find((k) => k.char === 'か');
    expect(ka).toMatchObject({ box: 1, seen: 1, fresh: false, due: true, ifMissed: 1, ifShaky: 3, ifGot: 7 });
  });
});

describe('countKanaMet', () => {
  it('counts the chart you have met, and ignores anything not on it', () => {
    expect(countKanaMet({})).toBe(0);
    expect(countKanaMet(bookWith(['あ', 'い', 'ん'], TODAY))).toBe(3);
    expect(countKanaMet(bookWith(['ア'], TODAY))).toBe(0);
  });
});
