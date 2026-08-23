import { describe, expect, it } from 'vitest';

import type { ApiCommitment, ApiMoneyEntry } from '@/lib/api';
import { isPayable, readBucketLedger } from '@/lib/bucketLedger';

const TODAY = '2026-08-23';

let seq = 0;
function entry(over: Partial<ApiMoneyEntry> = {}): ApiMoneyEntry {
  seq += 1;
  return {
    id: `e${seq}`,
    amount: 100,
    direction: 'out',
    note: 'spend',
    day: TODAY,
    created_at: '2026-08-23 01:00:00',
    bucket: 'needs',
    commitment_id: null,
    ...over,
  };
}

function bill(over: Partial<ApiCommitment> = {}): ApiCommitment {
  seq += 1;
  return {
    id: `c${seq}`,
    label: 'rent',
    amount: 8000,
    bucket: 'needs',
    due_day: 0,
    variable: false,
    active: true,
    paid_this_month: false,
    ...over,
  };
}

describe('readBucketLedger', () => {
  it('bands days newest first, with today always present even when empty', () => {
    const ledger = readBucketLedger(
      [entry({ day: '2026-08-21' }), entry({ day: '2026-08-22' })],
      [],
      'needs',
      TODAY,
    );
    expect(ledger.days.map((d) => d.day)).toEqual(['2026-08-23', '2026-08-22', '2026-08-21']);
    expect(ledger.days[0].items).toEqual([]);
    expect(ledger.days[0].total).toBe(0);
  });

  it('keeps only money out carrying this bucket', () => {
    const mine = entry({ note: 'groceries' });
    const ledger = readBucketLedger(
      [
        mine,
        entry({ direction: 'in', note: 'payday' }),
        entry({ bucket: 'wants', note: 'milk tea' }),
        entry({ bucket: null, note: 'untagged' }),
      ],
      [],
      'needs',
      TODAY,
    );
    expect(ledger.days[0].items).toEqual([mine]);
    expect(ledger.spent).toBe(100);
  });

  it('orders a day by its clock, latest spend on top', () => {
    const early = entry({ created_at: '2026-08-23 01:00:00' });
    const late = entry({ created_at: '2026-08-23 09:12:00' });
    const ledger = readBucketLedger([early, late], [], 'needs', TODAY);
    expect(ledger.days[0].items).toEqual([late, early]);
  });

  it('totals each day and counts its bills', () => {
    const ledger = readBucketLedger(
      [entry({ amount: 1000, commitment_id: 'c1' }), entry({ amount: 250 })],
      [],
      'needs',
      TODAY,
    );
    expect(ledger.days[0].total).toBe(1250);
    expect(ledger.days[0].bills).toBe(1);
    expect(ledger.spent).toBe(1250);
  });

  it('lists only live unpaid bills as due, in the order given', () => {
    const rent = bill({ label: 'rent', due_day: 5 });
    const ggives = bill({ label: 'ggives', due_day: 15, amount: 2000 });
    const ledger = readBucketLedger(
      [],
      [rent, ggives, bill({ paid_this_month: true }), bill({ active: false })],
      'needs',
      TODAY,
    );
    expect(ledger.due).toEqual([rent, ggives]);
    expect(ledger.dueTotal).toBe(10000);
  });

  it('rounds centavo drift out of the totals', () => {
    const ledger = readBucketLedger([entry({ amount: 0.1 }), entry({ amount: 0.2 })], [], 'needs', TODAY);
    expect(ledger.days[0].total).toBe(0.3);
    expect(ledger.spent).toBe(0.3);
  });
});

describe('isPayable', () => {
  it('wants a tap only while live and unpaid', () => {
    expect(isPayable(bill())).toBe(true);
    expect(isPayable(bill({ paid_this_month: true }))).toBe(false);
    expect(isPayable(bill({ active: false }))).toBe(false);
  });
});
