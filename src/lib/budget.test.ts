import { describe, expect, it } from 'vitest';

import type { ApiBudget, ApiCommitment } from '@/lib/api';
import { describeBucket, findBreaches, findDue, readBudget, sumDue, summariseBudget } from '@/lib/budget';
import { peso } from '@/lib/money';

let seq = 0;
function line(label: string, amount: number, bucket: 'needs' | 'wants', extra: Partial<ApiCommitment> = {}) {
  seq += 1;
  return {
    id: `c${seq}`,
    label,
    amount,
    bucket,
    due_day: 0,
    variable: false,
    active: true,
    paid_this_month: false,
    ...extra,
  } satisfies ApiCommitment;
}

function budget(
  monthlyIncome: number,
  commitments: ApiCommitment[] = [],
  actual: ApiBudget['actual'] = { needs: 0, wants: 0, untagged: 0 },
): ApiBudget {
  return { monthly_income: monthlyIncome, start_month: '2026-08', month: '2026-08', commitments, actual };
}

/** The scenario from the design proposal — a rent-heavy but real Philippine budget. */
function realistic(): ApiBudget {
  return budget(45000, [
    line('Rent', 12000, 'needs', { due_day: 5 }),
    line('Internet', 1699, 'needs', { due_day: 10 }),
    line('Electricity', 2200, 'needs', { due_day: 15 }),
    line('Water', 450, 'needs', { due_day: 15 }),
    line('Phone', 999, 'needs', { due_day: 20 }),
    line('Groceries', 6000, 'needs', { variable: true }),
    line('Motorcycle', 3200, 'needs', { due_day: 7 }),
    line('Credit card', 1500, 'needs', { due_day: 22 }),
    line('Eating out', 3000, 'wants'),
    line('Streaming', 549, 'wants'),
    line('Badminton court', 1600, 'wants'),
    line('Gym', 1200, 'wants'),
  ]);
}

describe('readBudget', () => {
  it('locks the targets to 50/30/20 of income', () => {
    const r = readBudget(budget(45000));
    expect(r.needs.target).toBe(22500);
    expect(r.wants.target).toBe(13500);
    expect(r.savings.target).toBe(9000);
  });

  it('derives savings as what needs and wants leave behind', () => {
    const r = readBudget(realistic());
    expect(r.needs.planned).toBe(28048);
    expect(r.wants.planned).toBe(6349);
    expect(r.savings.planned).toBe(10603); // 45000 − 28048 − 6349
  });

  it('always allocates exactly all of income, so the shares sum to 100%', () => {
    const r = readBudget(realistic());
    expect(r.allocated).toBe(r.income);
    expect(r.needs.share + r.wants.share + r.savings.share).toBeCloseTo(1, 10);
  });

  it('reads each bucket against its own line', () => {
    const r = readBudget(realistic());
    expect(r.needs.standing).toBe('over'); // 62% of income
    expect(r.needs.gap).toBe(5548); // 28048 − 22500
    expect(r.wants.standing).toBe('under'); // 14%
    expect(r.wants.gap).toBe(7151);
    expect(r.savings.standing).toBe('over'); // 24% — over is the good outcome here
    expect(r.savings.gap).toBe(1603);
  });

  it('ignores inactive commitments but keeps them in the list', () => {
    const b = budget(10000, [line('Gym', 1000, 'wants', { active: false }), line('Rent', 4000, 'needs')]);
    const r = readBudget(b);
    expect(r.wants.planned).toBe(0);
    expect(r.needs.planned).toBe(4000);
    expect(r.savings.planned).toBe(6000);
  });

  it('treats a sub-peso gap as sitting on the line, not a breach', () => {
    // Needs at 2500.4 against a 2500 line — rounding noise, not overspending.
    const r = readBudget(budget(5000, [line('Rent', 2500.4, 'needs')]));
    expect(r.needs.standing).toBe('on');
    expect(r.needs.gap).toBe(0);
  });

  it('lets savings go negative rather than clamping a plan that overspends', () => {
    const r = readBudget(budget(10000, [line('Rent', 9000, 'needs'), line('Gym', 3000, 'wants')]));
    expect(r.savings.planned).toBe(-2000);
    expect(r.savings.standing).toBe('under');
  });

  it('reads a backend too old to send a budget as simply not set up', () => {
    // The app and the always-on backend deploy separately, so this really happens.
    for (const missing of [undefined, null]) {
      const r = readBudget(missing);
      expect(r.isSet).toBe(false);
      expect(r.income).toBe(0);
      expect(r.needs.planned).toBe(0);
      expect(r.savings.planned).toBe(0);
    }
  });

  it('survives a budget whose commitments field is absent', () => {
    const r = readBudget({ monthly_income: 45000, start_month: '2026-08' } as never);
    expect(r.isSet).toBe(true);
    expect(r.needs.planned).toBe(0);
    expect(r.savings.planned).toBe(45000); // nothing committed, so it all falls through
  });

  it('is unset at zero income, and every share stays 0 rather than dividing by it', () => {
    const r = readBudget(budget(0, [line('Rent', 4000, 'needs')]));
    expect(r.isSet).toBe(false);
    expect(r.needs.share).toBe(0);
    expect(r.needs.target).toBe(0);
    expect(Number.isFinite(r.needs.share)).toBe(true);
  });
});

describe('actuals', () => {
  it('tracks what has really been spent alongside the plan', () => {
    const b = budget(45000, [line('Rent', 12000, 'needs'), line('Gym', 1200, 'wants')], {
      needs: 12000,
      wants: 620,
      untagged: 0,
    });
    const r = readBudget(b);
    expect(r.needs.planned).toBe(12000);
    expect(r.needs.actual).toBe(12000); // rent paid
    expect(r.wants.planned).toBe(1200);
    expect(r.wants.actual).toBe(620); // only the milk tea so far
  });

  it('counts saved-so-far as pay that has not gone anywhere yet', () => {
    const r = readBudget(budget(45000, [], { needs: 12000, wants: 620, untagged: 0 }));
    expect(r.savings.actual).toBe(32380); // 45000 − 12000 − 620
  });

  it('counts untagged spending against savings — the money is gone either way', () => {
    const r = readBudget(budget(45000, [], { needs: 12000, wants: 620, untagged: 300 }));
    expect(r.untagged).toBe(300);
    expect(r.savings.actual).toBe(32080); // the ₱300 still left the wallet
  });

  it('reads actuals as zero when the backend is too old to send them', () => {
    const r = readBudget({ monthly_income: 45000, start_month: '', month: '', commitments: [] } as never);
    expect(r.needs.actual).toBe(0);
    expect(r.untagged).toBe(0);
    expect(r.savings.actual).toBe(45000);
  });
});

describe('what is still due', () => {
  it('lists unpaid active commitments and totals them', () => {
    const b = budget(45000, [
      line('Rent', 12000, 'needs', { due_day: 5, paid_this_month: true }),
      line('Internet', 1699, 'needs', { due_day: 10 }),
      line('Phone', 999, 'needs', { due_day: 20 }),
      line('Old gym', 1200, 'wants', { active: false }),
    ]);
    expect(findDue(b).map((c) => c.label)).toEqual(['Internet', 'Phone']);
    expect(sumDue(b)).toBe(2698);
  });

  it('is empty once everything is paid, and safe with no budget at all', () => {
    const b = budget(45000, [line('Rent', 12000, 'needs', { paid_this_month: true })]);
    expect(findDue(b)).toEqual([]);
    expect(sumDue(b)).toBe(0);
    expect(findDue(undefined)).toEqual([]);
    expect(sumDue(null)).toBe(0);
  });
});

describe('findBreaches', () => {
  it('names only needs and wants, worst first — savings over its line is not a breach', () => {
    const b = budget(10000, [line('Rent', 6000, 'needs'), line('Gym', 3500, 'wants')]);
    const breaches = findBreaches(readBudget(b));
    expect(breaches.map((x) => x.bucket)).toEqual(['needs', 'wants']); // 1000 over, then 500
  });

  it('is empty when everything sits inside its line', () => {
    const b = budget(10000, [line('Rent', 5000, 'needs'), line('Gym', 3000, 'wants')]);
    expect(findBreaches(readBudget(b))).toEqual([]);
  });
});

describe('copy', () => {
  it('states each bucket as plain arithmetic, in both directions', () => {
    const r = readBudget(realistic());
    expect(describeBucket(r.needs, peso)).toBe('₱5,548 past the 50% line');
    expect(describeBucket(r.wants, peso)).toBe('₱7,151 under the 30% line');
    expect(describeBucket(r.savings, peso)).toBe('₱1,603 past the 20% line');
  });

  it('says "on the line" when a bucket lands on target', () => {
    const r = readBudget(budget(10000, [line('Rent', 5000, 'needs')]));
    expect(describeBucket(r.needs, peso)).toBe('on the 50% line');
  });

  it('names the bucket that is off and where the difference goes', () => {
    expect(summariseBudget(readBudget(realistic()), peso)).toBe(
      'Needs is ₱5,548 past its line — savings absorbs the difference.',
    );
  });

  it('reports both when needs and wants are over', () => {
    const b = budget(10000, [line('Rent', 6000, 'needs'), line('Gym', 3500, 'wants')]);
    expect(summariseBudget(readBudget(b), peso)).toBe(
      'Needs and wants are both past their lines — savings absorbs the difference.',
    );
  });

  it('leads with overspending when the plan exceeds income', () => {
    const b = budget(10000, [line('Rent', 9000, 'needs'), line('Gym', 3000, 'wants')]);
    expect(summariseBudget(readBudget(b), peso)).toBe('This plan spends ₱2,000 more than you earn.');
  });

  it('confirms a compliant plan without overselling it', () => {
    const b = budget(10000, [line('Rent', 5000, 'needs'), line('Gym', 3000, 'wants')]);
    expect(summariseBudget(readBudget(b), peso)).toBe('Every bucket sits inside its line.');
  });

  it('asks for pay before anything else', () => {
    expect(summariseBudget(readBudget(budget(0)), peso)).toBe('Set your take-home pay to see the lines.');
  });
});
