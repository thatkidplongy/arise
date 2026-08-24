import { describe, expect, it } from 'vitest';

import { HIRAGANA, breakKanaWord, describeKanaBuild } from '@/lib/kanaChart';

function charOf(char: string) {
  const found = HIRAGANA.find((k) => k.char === char);
  if (!found) throw new Error(`${char} is not on the chart`);
  return found;
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

/**
 * Read a broken-down word back out as romaji, from the units alone. Every piece has
 * to carry enough to rebuild the reading — a sokuon doubling what follows, a held
 * vowel lengthening what came before — so this is the check that the split is
 * telling the truth about the word rather than merely listing its characters.
 */
function readBack(units: ReturnType<typeof breakKanaWord>): string {
  const LONG: Record<string, string> = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };
  let out = '';
  let doubling = false;
  for (const unit of units) {
    if (unit.says.startsWith('a small つ')) {
      doubling = true;
      continue;
    }
    if (unit.says.startsWith('holds the sound on')) {
      out = out.slice(0, -1) + (LONG[out.slice(-1)] ?? out.slice(-1));
      continue;
    }
    const sound = unit.says.split(' — ')[0];
    out += doubling ? sound[0] + sound : sound;
    doubling = false;
  }
  return out;
}

describe('the example words', () => {
  it('gives every character but one a word spelled in hiragana alone', () => {
    const without = HIRAGANA.filter((k) => k.word === null);
    expect(without.map((k) => k.char)).toEqual(['みゅ']);
    expect(without[0].note).toContain('katakana');
  });

  it('picks a word that actually contains the character it is teaching', () => {
    const missing = HIRAGANA.filter((k) => k.word && !k.word.word.includes(k.char));
    expect(missing.map((k) => k.char)).toEqual([]);
  });

  it('spells every word in hiragana — no kanji, no katakana', () => {
    const foreign = HIRAGANA.filter((k) => k.word && /[^\u3041-\u309F]/.test(k.word.word));
    expect(foreign.map((k) => k.word?.word)).toEqual([]);
  });

  // を is the one word whose reading can't be rebuilt from its characters, because
  // the character lies: it is written 'wo' and said 'o'. That is the whole point of
  // the card, so it is exempted here and asserted on its own below.
  it('breaks each word back into its own reading, rule by rule', () => {
    const rebuilt = HIRAGANA.filter((k) => k.word && k.char !== 'を');
    const wrong = rebuilt.filter((k) => readBack(breakKanaWord(k.word!.word)) !== k.word!.romaji.replace(/ /g, ''));
    expect(wrong.map((k) => `${k.char}: ${k.word?.word}`)).toEqual([]);
    expect(rebuilt.length).toBe(102);
  });

  it('leaves を’s own trap standing: written “wo”, read “o”', () => {
    expect(readBack(breakKanaWord('みずをのむ'))).toBe('mizuwonomu');
    expect(charOf('を').word?.romaji).toBe('mizu o nomu');
  });
});

describe('breakKanaWord', () => {
  it('keeps a small ゃゅょ with the character it belongs to', () => {
    expect(breakKanaWord('きょう').map((u) => u.chars)).toEqual(['きょ', 'う']);
  });

  it('names the small つ as a pause rather than a sound', () => {
    const units = breakKanaWord('なっとう');
    expect(units.map((u) => u.chars)).toEqual(['な', 'っ', 'と', 'う']);
    expect(units[1].says).toContain('doubles the next consonant');
  });

  it('calls a vowel a held note only when it lengthens the sound before it', () => {
    expect(breakKanaWord('とう')[1].says).toBe('holds the sound on — a long ō');
    expect(breakKanaWord('だい')[1].says).toBe('i — the あ row');
  });

  it('stops holding after one — ちゅうい is chūi, not chūī', () => {
    const units = breakKanaWord('ちゅうい');
    expect(units[1].says).toBe('holds the sound on — a long ū');
    expect(units[2].says).toBe('i — the あ row');
  });

  it('tells you which row every plain character came from', () => {
    expect(breakKanaWord('ねこ').map((u) => u.says)).toEqual(['ne — the な row', 'ko — the か row']);
  });
});
