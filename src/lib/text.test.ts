import { describe, expect, it } from 'vitest';

import { snippet } from '@/lib/text';

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
