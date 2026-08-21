import { describe, expect, it } from 'vitest';

import { hasLoggedPayday, PAYDAY_NOTE, readMoneyDraft, type MoneyDraft } from '@/lib/moneyEntry';

function draft(extra: Partial<MoneyDraft> = {}): MoneyDraft {
  return { amount: '', note: '', direction: 'out', bucket: null, ...extra };
}

describe('readMoneyDraft', () => {
  it('logs nothing while the amount is blank', () => {
    expect(readMoneyDraft(draft())).toBeNull();
  });

  it('logs nothing for zero, negative or unparseable amounts', () => {
    expect(readMoneyDraft(draft({ amount: '0' }))).toBeNull();
    expect(readMoneyDraft(draft({ amount: '-250' }))).toBeNull();
    expect(readMoneyDraft(draft({ amount: 'lunch' }))).toBeNull();
  });

  it('keeps centavos and rounds past them', () => {
    expect(readMoneyDraft(draft({ amount: '250.5' }))?.amount).toBe(250.5);
    expect(readMoneyDraft(draft({ amount: '250.567' }))?.amount).toBe(250.57);
  });

  it('trims the note and falls back to a label per direction', () => {
    expect(readMoneyDraft(draft({ amount: '100', note: '  Sold a book  ' }))?.note).toBe('Sold a book');
    expect(readMoneyDraft(draft({ amount: '100', direction: 'out' }))?.note).toBe('Money out');
    expect(readMoneyDraft(draft({ amount: '100', direction: 'in' }))?.note).toBe('Money in');
  });

  it('keeps the bucket on money out', () => {
    expect(readMoneyDraft(draft({ amount: '900', direction: 'out', bucket: 'needs' }))?.bucket).toBe('needs');
    expect(readMoneyDraft(draft({ amount: '900', direction: 'out', bucket: 'wants' }))?.bucket).toBe('wants');
    expect(readMoneyDraft(draft({ amount: '900', direction: 'out', bucket: null }))?.bucket).toBeNull();
  });

  it('drops the bucket on money in — income is what the split is of', () => {
    expect(readMoneyDraft(draft({ amount: '20900', direction: 'in', bucket: 'needs' }))?.bucket).toBeNull();
  });

  it('carries the direction through', () => {
    expect(readMoneyDraft(draft({ amount: '500', direction: 'in' }))?.direction).toBe('in');
    expect(readMoneyDraft(draft({ amount: '500', direction: 'out' }))?.direction).toBe('out');
  });
});

describe('hasLoggedPayday', () => {
  it('is false for a day with no entries', () => {
    expect(hasLoggedPayday([])).toBe(false);
  });

  it('is true once the payday is in', () => {
    expect(hasLoggedPayday([{ direction: 'in', note: PAYDAY_NOTE }])).toBe(true);
  });

  it('ignores other money in — side income must leave the button tappable', () => {
    expect(
      hasLoggedPayday([
        { direction: 'in', note: 'Sold a book' },
        { direction: 'in', note: 'Gift' },
        { direction: 'out', note: 'Groceries' },
      ]),
    ).toBe(false);
  });

  it('finds the payday among other entries the same day', () => {
    expect(
      hasLoggedPayday([
        { direction: 'out', note: 'Rent' },
        { direction: 'in', note: 'Refund' },
        { direction: 'in', note: PAYDAY_NOTE },
      ]),
    ).toBe(true);
  });

  it('ignores money out that happens to carry the payday note', () => {
    expect(hasLoggedPayday([{ direction: 'out', note: PAYDAY_NOTE }])).toBe(false);
  });
});

describe('readMoneyDraft day', () => {
  it('defaults to blank, so the server uses the day of the request', () => {
    expect(readMoneyDraft(draft({ amount: '190' }))?.day).toBe('');
    expect(readMoneyDraft(draft({ amount: '190', day: '' }))?.day).toBe('');
  });

  it('passes a well-formed day through, so a spend can be back-dated', () => {
    expect(readMoneyDraft(draft({ amount: '190', day: '2026-08-20' }))?.day).toBe('2026-08-20');
  });

  it('drops a malformed day rather than losing the whole entry to a 422', () => {
    expect(readMoneyDraft(draft({ amount: '190', day: '20-08-2026' }))?.day).toBe('');
    expect(readMoneyDraft(draft({ amount: '190', day: 'thursday' }))?.day).toBe('');
    expect(readMoneyDraft(draft({ amount: '190', day: '2026-8-20' }))?.day).toBe('');
  });
});
