import { describe, expect, it } from 'vitest';

import { countChapters, describeChaptersRead } from '@/lib/reading';

describe('countChapters', () => {
  it('counts a single chapter', () => {
    expect(countChapters('12')).toBe(1);
    expect(countChapters('ch 12')).toBe(1);
  });

  it('counts a range by its span, whichever dash is typed', () => {
    expect(countChapters('5-7')).toBe(3);
    expect(countChapters('5–7')).toBe(3);
    expect(countChapters('5—7')).toBe(3);
    expect(countChapters('5 to 7')).toBe(3);
    expect(countChapters('ch 5 – 7')).toBe(3);
  });

  it('counts loose numbers one each', () => {
    expect(countChapters('3, 5, 8')).toBe(3);
  });

  it('mixes a range with loose numbers without double-counting', () => {
    expect(countChapters('5–7, 9')).toBe(4);
    expect(countChapters('1-3 and 8-9')).toBe(5);
  });

  it('handles a range typed backwards', () => {
    expect(countChapters('7–5')).toBe(3);
  });

  it('returns 0 when nothing is countable, rather than guessing', () => {
    expect(countChapters('')).toBe(0);
    expect(countChapters('   ')).toBe(0);
    expect(countChapters('the intro')).toBe(0);
  });
});

describe('describeChaptersRead', () => {
  it('reads against the book length when it is known', () => {
    expect(describeChaptersRead(5, 20)).toBe('5 of 20 chapters');
  });

  it('falls back to a running count, pluralised', () => {
    expect(describeChaptersRead(1, 0)).toBe('1 chapter so far');
    expect(describeChaptersRead(4, 0)).toBe('4 chapters so far');
  });
});
