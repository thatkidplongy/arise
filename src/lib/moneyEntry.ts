/**
 * One free-form line for the money log — the side income, gift, refund or one-off
 * spend that isn't a payday and isn't a standing commitment.
 *
 * The typing happens in the UI; the rules live here so they're testable and so the
 * client agrees with the server instead of sending fields it will silently drop.
 */

import type { ApiMoneyEntry, ApiMoneyInput } from '@/lib/api';

export type MoneyDirection = 'in' | 'out';
export type MoneyBucket = 'needs' | 'wants' | null;

/** The note the payday button writes, and the only thing that marks an entry as
 * *the* payday rather than any other money in. One constant so the button that
 * writes it and the check that looks for it can't drift apart. */
export const PAYDAY_NOTE = 'Payday';

/**
 * Whether the payday has already been logged among these entries — pass one day's
 * worth to guard the payday button against a double-tap.
 *
 * Deliberately narrower than "any money in today": side income, a gift or a refund
 * logged the same day must leave the payday button tappable, since they're not the
 * payday. A plain total-in check can't tell those apart.
 */
export function hasLoggedPayday(entries: readonly Pick<ApiMoneyEntry, 'direction' | 'note'>[]): boolean {
  return entries.some((e) => e.direction === 'in' && e.note === PAYDAY_NOTE);
}

/** What the form holds — amount and note as typed, so both can be mid-edit. */
export interface MoneyDraft {
  amount: string;
  note: string;
  direction: MoneyDirection;
  bucket: MoneyBucket;
  /** The day the money moved, 'YYYY-MM-DD'. Absent or '' means the day of the
   * request, which is what a form logging something as it happens wants. */
  day?: string;
}

/** What the API takes, once the draft is worth sending — the wire shape itself, so
 * there's nothing to keep in sync. */
export type MoneyEntryInput = ApiMoneyInput;

/** A 'YYYY-MM-DD' and nothing else. Anything malformed is dropped rather than sent:
 * the server would reject the whole request, and losing the back-date is a far
 * better outcome than losing the entry. */
const DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Stands in for a note left blank, so no entry lands in the log unlabelled. */
const FALLBACK_NOTE: Record<MoneyDirection, string> = { in: 'Money in', out: 'Money out' };

/**
 * The draft as a loggable entry, or null when there's nothing to log — a blank,
 * zero, negative or unparseable amount. Returning null rather than throwing keeps
 * the submit handler a no-op on a half-typed form, the same way the commitment
 * form ignores an incomplete line.
 *
 * A note is trimmed and falls back to a plain label. The bucket is dropped on money
 * in: income isn't divided by the 50/30/20 rule, it's what the division is *of*,
 * and the backend ignores it there — so this drops it here too rather than letting
 * the UI imply a tag that never lands.
 *
 * The day is passed through only when it's a well-formed date; the server treats ''
 * as "the day of the request". Whether that day is in the *past* is the server's
 * call, since only it can be trusted about what "future" means here.
 */
export function readMoneyDraft(draft: MoneyDraft): MoneyEntryInput | null {
  const amount = Math.round(parseFloat(draft.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const day = draft.day ?? '';
  return {
    amount,
    direction: draft.direction,
    note: draft.note.trim() || FALLBACK_NOTE[draft.direction],
    bucket: draft.direction === 'out' ? draft.bucket : null,
    day: DAY_PATTERN.test(day) ? day : '',
  };
}
