import { dayMonth } from '@/lib/dates';
import type { ApiPace } from '@/lib/api';

/**
 * Reading is logged in the reader's own words — "5–7", "12", "the intro and ch 3".
 * These turn that label into the chapter count progress is measured in, so the
 * count is a suggestion you can override rather than a second thing to type.
 */

/** Ranges typed as 5-7, 5–7 (en dash), 5—7 (em dash), or "5 to 7". */
const RANGE = /(\d+)\s*(?:-|–|—|to)\s*(\d+)/g;
const NUMBER = /\d+/g;

/**
 * How many chapters a label describes: a range counts its span, loose numbers count
 * one each. Returns 0 when there's no number at all — a label like "the intro" says
 * nothing countable, and guessing 1 would quietly move the progress bar.
 */
export function countChapters(label: string): number {
  const text = label.trim();
  if (!text) return 0;

  let total = 0;
  // Ranges are consumed first, so "5–7, 9" counts 3 + 1 rather than 5, 7 and 9.
  const rest = text.replace(RANGE, (_match, from: string, to: string) => {
    const span = Math.abs(Number(to) - Number(from)) + 1;
    total += span;
    return ' ';
  });

  total += (rest.match(NUMBER) ?? []).length;
  return total;
}

/** How the logged count reads next to the book's length, e.g. "5 of 20 chapters". */
export function describeChaptersRead(chaptersRead: number, total: number): string {
  if (total > 0) return `${chaptersRead} of ${total} chapters`;
  return `${chaptersRead} chapter${chaptersRead === 1 ? '' : 's'} so far`;
}

/**
 * How the book reads under its running sentence, e.g. "Deep Work · 8 sittings".
 *
 * The count is the reading log's own sittings, the same ones the reading card lists,
 * so the two panels can't disagree about how much of the book is behind you. With no
 * count the book stands on its own — a phone can be ahead of the backend service, and
 * "0 sittings" under a summary of the book would be a plain contradiction.
 */
export function describeThreadBook(title: string, sittings: number): string {
  if (sittings <= 0) return title;
  return `${title} · ${sittings} sitting${sittings === 1 ? '' : 's'}`;
}

// A source's marker names chapters ('ch 2', 'chapters 5–7') or pages ('pp 40-52').
// Only the chapter ones place you in the book — page numbers belong to one edition
// and wouldn't line up with a chapter count anyway — so a span never mixes the two.
// A book divided into books ('Book 9' of Meditations) is divided into chapters.
const CHAPTER_MARKER = /^(?:ch|chap|chapter|chapters|book|books)\b/i;

/**
 * The chapters a set of sources covers, as a stack's byline wears it: 'ch 1',
 * 'ch 3-4' and 'ch 9' together read "ch. 1–9".
 *
 * Empty when nothing in the set names a chapter. A stack of page markers, or of
 * sources logged without one, says nothing about where in the book you are, and a
 * byline that made a span up would be read as progress.
 */
export function chapterSpan(markers: readonly string[]): string {
  const numbers: number[] = [];
  for (const marker of markers) {
    if (!CHAPTER_MARKER.test(marker.trim())) continue;
    for (const found of marker.match(NUMBER) ?? []) numbers.push(Number(found));
  }
  if (numbers.length === 0) return '';
  const low = Math.min(...numbers);
  const high = Math.max(...numbers);
  return low === high ? `ch. ${low}` : `ch. ${low}–${high}`;
}

/**
 * How a stretch of days reads to a person: "9 days", "3 weeks", "2 months".
 *
 * Rounded up the scale as it grows, because precision stops meaning anything past a
 * fortnight — "47 days left" is a number you have to convert; "7 weeks" is one you
 * already feel.
 */
export function describeSpan(days: number): string {
  if (days <= 0) return 'today';
  if (days === 1) return '1 day';
  if (days < 14) return `${days} days`;
  const weeks = Math.round(days / 7);
  if (weeks < 9) return `${weeks} weeks`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'}`;
}

/** The pace held so far, e.g. "3.5 chapters a week". */
export function describePace(perWeek: number): string {
  if (perWeek <= 0) return 'nothing logged yet';
  const rounded = perWeek >= 10 ? Math.round(perWeek) : Math.round(perWeek * 10) / 10;
  return `${rounded} chapter${rounded === 1 ? '' : 's'} a week`;
}

/**
 * When the book lands at the pace being held: "about 3 weeks left — around 9 Aug".
 *
 * A book already at its last chapter is waiting on "Did you finish it?" rather than
 * on more reading, so it says that instead of projecting a date.
 */
export function describeFinish(pace: ApiPace): string {
  if (pace.chapters_left <= 0) return 'That’s the whole book by your count';
  if (!pace.finish_by) return 'Not enough logged yet to say';
  return `About ${describeSpan(pace.days_left)} left — around ${dayMonth(pace.finish_by)}`;
}
