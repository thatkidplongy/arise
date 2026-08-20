/**
 * One free-form line for the money log — the side income, gift, refund or one-off
 * spend that isn't a payday and isn't a standing commitment.
 *
 * The typing happens in the UI; the rules live here so they're testable and so the
 * client agrees with the server instead of sending fields it will silently drop.
 */

export type MoneyDirection = 'in' | 'out';
export type MoneyBucket = 'needs' | 'wants' | null;

/** What the form holds — amount and note as typed, so both can be mid-edit. */
export interface MoneyDraft {
  amount: string;
  note: string;
  direction: MoneyDirection;
  bucket: MoneyBucket;
}

/** What the API takes, once the draft is worth sending. */
export interface MoneyEntryInput {
  amount: number;
  direction: MoneyDirection;
  note: string;
  bucket: MoneyBucket;
}

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
 */
export function readMoneyDraft(draft: MoneyDraft): MoneyEntryInput | null {
  const amount = Math.round(parseFloat(draft.amount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  return {
    amount,
    direction: draft.direction,
    note: draft.note.trim() || FALLBACK_NOTE[draft.direction],
    bucket: draft.direction === 'out' ? draft.bucket : null,
  };
}
