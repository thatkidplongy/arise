import { describe, expect, it } from 'vitest';

import {
  chapterSpan,
  countChapters,
  describeChaptersRead,
  describeFinish,
  describePace,
  describeSpan,
  describeThreadBook,
} from '@/lib/reading';

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

  it('reads a book divided into books as chapters', () => {
    expect(chapterSpan(['Book 9', 'Book 10-12'])).toBe('ch. 9–12');
  });

  it('says nothing when no source named a chapter', () => {
    expect(chapterSpan([])).toBe('');
    expect(chapterSpan(['', 'the intro'])).toBe('');
  });
});

describe('describeSpan', () => {
  it('counts days up to a fortnight, then rounds to the unit you feel', () => {
    expect(describeSpan(0)).toBe('today');
    expect(describeSpan(1)).toBe('1 day');
    expect(describeSpan(9)).toBe('9 days');
    expect(describeSpan(21)).toBe('3 weeks');
    expect(describeSpan(60)).toBe('2 months');
  });
});

describe('describePace', () => {
  it('reads as chapters a week, and says so when there is no pace', () => {
    expect(describePace(3.5)).toBe('3.5 chapters a week');
    expect(describePace(1)).toBe('1 chapter a week');
    expect(describePace(12.4)).toBe('12 chapters a week');
    expect(describePace(0)).toBe('nothing logged yet');
  });
});

describe('describeFinish', () => {
  const pace = {
    started: '2026-07-01',
    days_in: 10,
    chapters_left: 15,
    per_week: 3.5,
    days_left: 30,
    finish_by: '2026-08-09',
  };

  it('names how long is left and roughly when', () => {
    expect(describeFinish(pace)).toBe('About 4 weeks left — around 9 Aug');
  });

  it('stops projecting once the book is covered', () => {
    expect(describeFinish({ ...pace, chapters_left: 0, days_left: 0, finish_by: '2026-07-10' })).toBe(
      'That’s the whole book by your count',
    );
  });

  it('says nothing rather than guessing when there is no projection', () => {
    expect(describeFinish({ ...pace, finish_by: '' })).toBe('Not enough logged yet to say');
  });
});
