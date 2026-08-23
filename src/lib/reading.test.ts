import { describe, expect, it } from 'vitest';

import { chapterSpan, countChapters, describeChaptersRead, describeThreadBook } from '@/lib/reading';

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

describe('describeThreadBook', () => {
  it('names the book and how many sittings are behind the sentence', () => {
    expect(describeThreadBook('Deep Work', 8)).toBe('Deep Work · 8 sittings');
    expect(describeThreadBook('Deep Work', 1)).toBe('Deep Work · 1 sitting');
  });

  it('lets the book stand alone rather than claiming no sittings', () => {
    expect(describeThreadBook('Deep Work', 0)).toBe('Deep Work');
  });
});

describe('chapterSpan', () => {
  it('spans the lowest chapter named to the highest', () => {
    expect(chapterSpan(['ch 3', 'ch 9-10', 'chapters 1–2'])).toBe('ch. 1–10');
  });

  it('names a single chapter on its own', () => {
    expect(chapterSpan(['ch 4', 'ch. 4'])).toBe('ch. 4');
  });

  it('ignores page markers — they place you in an edition, not in the book', () => {
    expect(chapterSpan(['pp 40-52', 'p 8'])).toBe('');
    expect(chapterSpan(['pp 40-52', 'ch 6'])).toBe('ch. 6');
  });

  it('says nothing when no source named a chapter', () => {
    expect(chapterSpan([])).toBe('');
    expect(chapterSpan(['', 'the intro'])).toBe('');
  });
});
