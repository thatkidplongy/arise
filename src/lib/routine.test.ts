import { describe, expect, it } from 'vitest';

import { blockOf, currentBlockKey } from '@/lib/routine';

describe('blockOf', () => {
  it('falls back to the attribute default window', () => {
    expect(blockOf({ stat: 'SPI', title: 'Inner Gate' })).toBe('morning');
    expect(blockOf({ stat: 'STR', title: 'Hunter Conditioning' })).toBe('day');
    expect(blockOf({ stat: 'INT', title: 'Grimoire Study' })).toBe('evening');
    expect(blockOf({ stat: 'ZZZ', title: '' })).toBe('day');
  });

  it("honours a time of day named in the quest's title", () => {
    expect(blockOf({ stat: 'SPI', title: 'Evening Reflect' })).toBe('evening');
    expect(blockOf({ stat: 'STR', title: 'Bedtime Mobility' })).toBe('night');
    expect(blockOf({ stat: 'INT', title: 'Morning Pages' })).toBe('morning');
  });

  it('gives the index cards the morning, whatever their title rotates to', () => {
    // Intelligence reads in the evening; the pile is the exception, because the
    // ladder fills it overnight. Its titles rotate daily, so the slot decides.
    expect(blockOf({ id: 'd-recall', stat: 'INT', title: 'Index Cards' })).toBe('morning');
    expect(blockOf({ id: 'd-recall', stat: 'INT', title: 'Cold Recall' })).toBe('morning');
    // A slot's own window outranks a title that names a different one.
    expect(blockOf({ id: 'd-recall', stat: 'INT', title: 'Evening Reflect' })).toBe('morning');
  });

  it('closes the day on the look-back, whichever lens it wears', () => {
    // Spirit's default is the morning, and none of the lens titles names a time.
    for (const title of ['Hansei', 'Kaizen', 'Poka-yoke', 'Kata', 'Shokunin', 'Shuhari'])
      expect(blockOf({ id: 'd-hansei', stat: 'SPI', title })).toBe('night');
  });

  it('leaves every other slot to the title and attribute rules', () => {
    expect(blockOf({ id: 'd-read', stat: 'INT', title: 'Deep Page' })).toBe('evening');
  });
});

describe('currentBlockKey', () => {
  it('maps an hour to the window it falls in', () => {
    expect(currentBlockKey(6)).toBe('morning');
    expect(currentBlockKey(11)).toBe('day');
    expect(currentBlockKey(16)).toBe('day');
    expect(currentBlockKey(17)).toBe('evening');
    expect(currentBlockKey(23)).toBe('night');
  });

  it('puts the pre-dawn hours in wind-down rather than in the morning', () => {
    expect(currentBlockKey(0)).toBe('night');
    expect(currentBlockKey(4)).toBe('night');
    expect(currentBlockKey(5)).toBe('morning');
  });
});
