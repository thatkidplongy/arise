import type { ApiCommitment, ApiMoneyEntry } from '@/lib/api';
import { groupByDay, type DayGroup } from '@/lib/dayGroups';

/** One calendar day of a bucket's spending — a band of the dated ledger. Items are
 * newest first, by the day's clock, so the latest spend sits on top. */
export interface LedgerDay extends DayGroup<ApiMoneyEntry> {
  total: number;
  /** How many of the day's entries were standing bills, for the collapsed row's tag. */
  bills: number;
}

export interface BucketLedgerReading {
  /** Days that saw spending, newest first. Today is always present — empty or not —
   * because "what did today cost" is the question the ledger opens on. */
  days: LedgerDay[];
  /** Pesos out against this bucket across the period the entries cover. */
  spent: number;
  /** Bills still owed this month — active and unpaid, in the server's due order. */
  due: ApiCommitment[];
  dueTotal: number;
}

/** Pesos never want fractional centavos on screen. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Live and unpaid — the only state in which a bill still wants a tap. Shared so the
 * due list and anything that summarises it can't disagree about what's still owed. */
export function isPayable(item: ApiCommitment): boolean {
  return item.active && !item.paid_this_month;
}

/**
 * A bucket's spending as a dated ledger: one band per calendar day, newest first,
 * plus the bills still owed this month. This is the one place the grouping is
 * derived — the needs and wants panels both read it, neither recomputes it.
 *
 * Only money out carrying this bucket's tag lands in a band. Income and untagged
 * spending belong to other surfaces, and a band that quietly mixed them in would
 * make the day totals disagree with the 50/30/20 actuals.
 */
export function readBucketLedger(
  entries: readonly ApiMoneyEntry[],
  commitments: readonly ApiCommitment[],
  bucket: 'needs' | 'wants',
  today: string,
): BucketLedgerReading {
  const mine = entries
    .filter((e) => e.direction === 'out' && e.bucket === bucket)
    .sort((a, b) => b.day.localeCompare(a.day) || b.created_at.localeCompare(a.created_at));

  const days = groupByDay(mine, (e) => e.day, today).map((band) => ({
    ...band,
    total: round2(band.items.reduce((sum, e) => sum + e.amount, 0)),
    bills: band.items.filter((e) => e.commitment_id).length,
  }));

  const due = commitments.filter(isPayable);
  return {
    days,
    spent: round2(mine.reduce((sum, e) => sum + e.amount, 0)),
    due,
    dueTotal: round2(due.reduce((sum, c) => sum + c.amount, 0)),
  };
}
