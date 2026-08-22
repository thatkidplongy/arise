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
