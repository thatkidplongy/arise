import { describe, expect, it } from 'vitest';

import { initialOf, initialsOf, snippet, spellCount } from '@/lib/text';

describe('snippet', () => {
  it('takes the first non-empty line', () => {
    expect(snippet('\n\n  Faults are not failures  \nand more')).toBe('Faults are not failures');
  });

  it('strips the leading block markers', () => {
    expect(snippet('## Foundations')).toBe('Foundations');
    expect(snippet('> a quote')).toBe('a quote');
    expect(snippet('- a bullet')).toBe('a bullet');
    expect(snippet('* a bullet')).toBe('a bullet');
    expect(snippet('1. an item')).toBe('an item');
  });

  it('strips the inline marks, keeping their text', () => {
    expect(snippet('Faults are not **failures**')).toBe('Faults are not failures');
    expect(snippet('__bold__ and _italic_')).toBe('bold and italic');
    expect(snippet('*italic* and ~~struck~~')).toBe('italic and struck');
    expect(snippet('call `fsync()` first')).toBe('call fsync() first');
  });

  it('strips block and inline marks together', () => {
    expect(snippet('- **Percentiles** beat _averages_')).toBe('Percentiles beat averages');
  });

  it('leaves marks inside a code span as typed', () => {
    expect(snippet('`a**b**c` matters')).toBe('a**b**c matters');
  });

  it('leaves an unpaired marker alone', () => {
    expect(snippet('a ** b')).toBe('a ** b');
    expect(snippet('2 * 3 = 6')).toBe('2 * 3 = 6');
  });

  // The preview reads the line the way the note renders it, marker for marker — a
  // stray pair the renderer would italicise reads as italic here too.
  it('follows the renderer on a stray pair', () => {
    expect(snippet('2 * 3 * 4 = 24')).toBe('2  3  4 = 24');
  });

  it('returns empty for nothing to preview', () => {
    expect(snippet('')).toBe('');
    expect(snippet('   \n  \n')).toBe('');
  });
});

describe('initialOf', () => {
  it('takes the first letter, uppercased', () => {
    expect(initialOf('Deep Work')).toBe('D');
    expect(initialOf('patterns & problem-solving')).toBe('P');
  });

  it('skips what a title merely opens with', () => {
    expect(initialOf('  Japanese — hiragana')).toBe('J');
    expect(initialOf('“Rework”')).toBe('R');
    expect(initialOf('- a captured note')).toBe('A');
  });

  it('keeps a character that has no uppercase of its own', () => {
    expect(initialOf('日本語')).toBe('日');
    expect(initialOf('ひらがな')).toBe('ひ');
  });

  it('takes an astral character whole', () => {
    expect(initialOf('📕 shelf')).toBe('📕');
  });

  it('returns empty when there is no name', () => {
    expect(initialOf('')).toBe('');
    expect(initialOf('   ')).toBe('');
  });
});

describe('initialsOf', () => {
  it('takes one letter per word it is known by', () => {
    expect(initialsOf('Deep Work')).toBe('DW');
    expect(initialsOf('Thinking, fast and slow')).toBe('TFS');
  });

  it('skips the words the title only leans on', () => {
    expect(initialsOf('The Psychology of Money')).toBe('PM');
    expect(initialsOf('From your reflections')).toBe('FR');
  });

  it('reads a separator as a word break', () => {
    expect(initialsOf('Tips · YouTube')).toBe('TY');
    expect(initialsOf('Patterns & problem-solving')).toBe('PP');
    expect(initialsOf('Japanese — hiragana')).toBe('JH');
  });

  it('stops at three, so a long title stays initials', () => {
    expect(initialsOf('How to Read a Book, Mortimer J. Adler')).toBe('HRB');
  });

  it('leaves a one-word title as what it already is', () => {
    expect(initialsOf('DDIA')).toBe('DDIA');
    expect(initialsOf('Meditations')).toBe('M');
    expect(initialsOf('日本語')).toBe('日本語');
  });

  it('keeps a minor word when that is the whole title', () => {
    expect(initialsOf('The')).toBe('T');
  });

  it('returns empty when there is no name', () => {
    expect(initialsOf('')).toBe('');
    expect(initialsOf(' · ')).toBe('');
  });
});

describe('spellCount', () => {
  it('says small counts the way a sentence would', () => {
    expect(spellCount(9)).toBe('nine');
    expect(spellCount(0)).toBe('zero');
  });

  it('falls back to numerals past twelve', () => {
    expect(spellCount(13)).toBe('13');
  });
});
