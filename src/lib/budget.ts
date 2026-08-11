import type { ApiBudget, ApiCommitment, BudgetBucket } from '@/lib/api';

/**
 * The 50/30/20 rule. The split is fixed on purpose — it's the whole point of the
 * worksheet, so there's nothing here to configure and nothing that can drift.
 */
export const BUDGET_SPLIT: Record<BudgetBucket, number> = { needs: 0.5, wants: 0.3, savings: 0.2 };

export const BUDGET_BUCKETS: BudgetBucket[] = ['needs', 'wants', 'savings'];

export const BUCKET_LABEL: Record<BudgetBucket, string> = {
  needs: 'Needs',
  wants: 'Wants',
  savings: 'Savings',
};

/** Where a bucket sits against its line. `over` is only a problem for needs and
 * wants — for savings it's the good outcome, so the caller picks the colour. */
export type BucketStanding = 'over' | 'under' | 'on';

export interface BucketReading {
  bucket: BudgetBucket;
  /** Pesos committed to this bucket. Savings is what income leaves behind. */
  planned: number;
  /** Pesos that have actually left the wallet this month against this bucket. For
   * savings this is what's left of income after real spending, not a plan. */
  actual: number;
  /** The locked share of income this bucket is allowed. */
  target: number;
  /** Share of income actually planned, 0–1. Guards income 0 → 0. */
  share: number;
  standing: BucketStanding;
  /** Always positive — how far off the line, in pesos. 0 when exactly on it. */
  gap: number;
}

export interface BudgetReading {
  /** What the lines divide: money actually received this month. Same as
   * `received` — kept under both names since targets read as shares of income. */
  income: number;
  /** Money actually in this month — 0 before any has landed. */
  received: number;
  /** True once take-home pay is set; the worksheet's empty state keys off this. */
  isSet: boolean;
  needs: BucketReading;
  wants: BucketReading;
  savings: BucketReading;
  /** Needs + wants + savings, which always equals income exactly (see savings). */
  allocated: number;
  /** Spending logged with no bucket — from before the budget, or left untagged.
   * Surfaced so the actuals can be read honestly rather than looking complete. */
  untagged: number;
}

/** Pesos never want fractional centavos on screen. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function sumBucket(commitments: ApiCommitment[], bucket: BudgetBucket): number {
  return round2(
    commitments.filter((c) => c.active && c.bucket === bucket).reduce((total, c) => total + c.amount, 0),
  );
}

/** An empty budget — what a backend too old to send one is treated as. */
const NO_BUDGET: ApiBudget = {
  monthly_income: 0,
  start_month: '',
  month: '',
  commitments: [],
  actual: { income: 0, needs: 0, wants: 0, untagged: 0 },
};

function readBucket(bucket: BudgetBucket, planned: number, actual: number, income: number): BucketReading {
  const target = round2(income * BUDGET_SPLIT[bucket]);
  const gap = round2(Math.abs(planned - target));
  // A sub-peso gap is rounding noise, not a real breach — read it as on the line.
  const standing: BucketStanding = gap < 1 ? 'on' : planned > target ? 'over' : 'under';
  return {
    bucket,
    planned,
    actual,
    target,
    share: income > 0 ? planned / income : 0,
    standing,
    gap: standing === 'on' ? 0 : gap,
  };
}

/**
 * Read a budget against the 50/30/20 lines.
 *
 * Savings is **derived**, not committed to: it's whatever income is left after
 * needs and wants, which is why there's no savings commitment to add. That keeps
 * needs + wants + savings equal to income exactly, so the three shares always sum
 * to 100% and overspending one bucket visibly comes out of another.
 *
 * Savings can go negative — plan to spend more than you earn and that's the honest
 * reading, not a floor to clamp at.
 *
 * Accepts a missing budget on purpose. The app and the backend are deployed
 * independently — the phone can pick up a new bundle while the always-on brain is
 * still on an older build — so a backend that doesn't send `budget` yet has to read
 * as "not set up", not crash the whole money screen.
 */
export function readBudget(budget: ApiBudget | null | undefined): BudgetReading {
  const safe = budget ?? NO_BUDGET;
  const spentSafe = safe.actual ?? NO_BUDGET.actual;
  // The rule follows the money: it divides only what actually came in this month —
  // paydays as they land, plus any extra. No projections: before the first payday
  // lands there is nothing to divide, so there are no lines.
  const received = round2(Math.max(0, spentSafe.income ?? 0));
  const income = received;
  const commitments = safe.commitments ?? [];
  const needs = sumBucket(commitments, 'needs');
  const wants = sumBucket(commitments, 'wants');
  const savings = round2(income - needs - wants);

  const untagged = round2(spentSafe.untagged ?? 0);
  const actualNeeds = round2(spentSafe.needs ?? 0);
  const actualWants = round2(spentSafe.wants ?? 0);
  // Saved so far = pay that hasn't gone anywhere yet. Untagged spending counts
  // against it too: the money is gone regardless of whether it carried a tag.
  const actualSavings = round2(income - actualNeeds - actualWants - untagged);

  return {
    income,
    received,
    // Set once payday pay is stored or money has landed — gates the empty state.
    isSet: round2(Math.max(0, safe.monthly_income ?? 0)) > 0 || received > 0,
    needs: readBucket('needs', needs, actualNeeds, income),
    wants: readBucket('wants', wants, actualWants, income),
    savings: readBucket('savings', savings, actualSavings, income),
    allocated: round2(needs + wants + savings),
    untagged,
  };
}

/**
 * The commitments still owed this month — active, not yet paid. This is the list
 * the money screen offers as one-tap entries, which is the whole reason a bill
 * never has to be typed twice.
 */
export function findDue(budget: ApiBudget | null | undefined): ApiCommitment[] {
  return (budget?.commitments ?? []).filter((c) => c.active && !c.paid_this_month);
}

/** Pesos still owed on unpaid commitments this month. */
export function sumDue(budget: ApiBudget | null | undefined): number {
  return round2(findDue(budget).reduce((total, c) => total + c.amount, 0));
}

/** The buckets that are off their line, worst first — what the summary names. */
export function findBreaches(reading: BudgetReading): BucketReading[] {
  return BUDGET_BUCKETS.map((b) => reading[b])
    .filter((r) => r.standing === 'over' && r.bucket !== 'savings')
    .sort((a, b) => b.gap - a.gap);
}

/**
 * One bucket's standing, in words. Deliberately the same phrasing for every bucket
 * and both directions: it states the arithmetic and nothing else. Whether being
 * over is good (savings) or worth trimming (needs) is carried by colour and by the
 * summary — never by the tone here.
 *
 * This is also the accessible signal. Brick and sage sit at almost identical
 * lightness (1.34:1), so colour alone can't tell anyone which side of the line
 * they're on. These words are what actually convey it.
 */
export function describeBucket(reading: BucketReading, peso: (n: number) => string): string {
  const line = `${Math.round(BUDGET_SPLIT[reading.bucket] * 100)}% line`;
  if (reading.standing === 'on') return `on the ${line}`;
  return `${peso(reading.gap)} ${reading.standing === 'over' ? 'past' : 'under'} the ${line}`;
}

/**
 * The whole budget in one line. Names what's off without scolding — per DESIGN.md
 * this app has no punishment mechanics, so the copy reports the consequence
 * instead of passing judgement. "Savings absorbs the difference" is literally
 * true: savings is the remainder, so pesos over on needs come straight out of it.
 */
export function summariseBudget(reading: BudgetReading, peso: (n: number) => string): string {
  if (!reading.isSet) return 'Set your take-home pay to see the lines.';

  if (reading.savings.planned < 0) {
    return `This plan spends ${peso(Math.abs(reading.savings.planned))} more than you earn.`;
  }

  const breaches = findBreaches(reading);
  if (breaches.length === 0) return 'Every bucket sits inside its line.';
  if (breaches.length === 1) {
    const [worst] = breaches;
    return `${BUCKET_LABEL[worst.bucket]} is ${peso(worst.gap)} past its line — savings absorbs the difference.`;
  }
  return 'Needs and wants are both past their lines — savings absorbs the difference.';
}
