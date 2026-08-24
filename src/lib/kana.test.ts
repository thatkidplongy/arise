import { describe, expect, it } from 'vitest';

import {
  HIRAGANA,
  KANA_NEW_PER_DAY,
  buildKanaDeck,
  countKanaMet,
  describeKanaBuild,
  gradeKana,
  kanaIntervalFor,
  type KanaBook,
} from '@/lib/kana';

const TODAY = '2026-08-24';

function charOf(char: string) {
  const found = HIRAGANA.find((k) => k.char === char);
  if (!found) throw new Error(`${char} is not on the chart`);
  return found;
}

/** A book where `chars` are all sitting on box 1, due on `due`. */
function bookWith(chars: string[], due: string, first = '2026-08-01'): KanaBook {
  return Object.fromEntries(chars.map((char) => [char, { box: 1, due, first, last: first, seen: 1 }]));
}

describe('the chart', () => {
  it('holds every hiragana once — the plain rows, both marks, and the combinations', () => {
    expect(HIRAGANA).toHaveLength(104);
    expect(new Set(HIRAGANA.map((k) => k.char)).size).toBe(104);
    expect(HIRAGANA.every((k) => k.romaji.length > 0)).toBe(true);
  });

  it('opens on あ and teaches the plain chart before anything marked or combined', () => {
    expect(HIRAGANA[0].char).toBe('あ');
    const firstMarked = HIRAGANA.findIndex((k) => k.group !== 'base');
    expect(firstMarked).toBe(46);
    expect(HIRAGANA.slice(46, 66).every((k) => k.group === 'dakuten')).toBe(true);
    expect(HIRAGANA.at(-1)?.group).toBe('combo');
  });

  it('files each character in its own row, with the row’s sounds beside it', () => {
    expect(charOf('く').row.label).toBe('か');
    expect(charOf('く').row.romaji).toEqual(['ka', 'ki', 'ku', 'ke', 'ko']);
  });

  it('names what a marked or combined character is built out of', () => {
    expect(charOf('ぎ').from).toBe('き');
    expect(charOf('ぱ').from).toBe('は');
    expect(charOf('じゃ').from).toBe('じ');
    expect(charOf('あ').from).toBe('');
  });

  it('says so on the back, and says nothing on a plain character', () => {
    expect(describeKanaBuild(charOf('が'))).toBe('か with a dakuten (゛) — か voiced.');
    expect(describeKanaBuild(charOf('ぴ'))).toBe('ひ with a handakuten (゜).');
    expect(describeKanaBuild(charOf('しゅ'))).toBe('し with a small ゅ — one sound, not two.');
    expect(describeKanaBuild(charOf('こ'))).toBe('');
  });

  it('warns about the characters that are read one way and used another', () => {
    expect(charOf('を').note).toContain('said “o”');
    expect(charOf('こ').note).toBe('');
  });
});

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
