import { describe, expect, it } from 'vitest';

import { foldItems } from '@/lib/fold';

const list = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('foldItems', () => {
  it('shows everything when the list is short', () => {
    const { shown, rest, folds } = foldItems(list(3), 5, false);
    expect(shown).toEqual([0, 1, 2]);
    expect(rest).toEqual([]);
    expect(folds).toBe(false);
  });

  it('does not fold a single extra row — a tap to reveal one line is a worse deal', () => {
    expect(foldItems(list(6), 5, false).folds).toBe(false);
    expect(foldItems(list(6), 5, false).shown).toHaveLength(6);
  });

  it('folds from two extra rows on', () => {
    const { shown, rest, folds } = foldItems(list(7), 5, false);
    expect(folds).toBe(true);
    expect(shown).toEqual([0, 1, 2, 3, 4]);
    expect(rest).toEqual([5, 6]);
  });

  it('shows everything once expanded, and still reports that it folds', () => {
    const { shown, rest, folds } = foldItems(list(20), 5, true);
    expect(shown).toHaveLength(20);
    expect(rest).toEqual([]);
    expect(folds).toBe(true); // the toggle has to stay on screen to fold back up
  });

  it('splits the list in two with nothing lost or repeated', () => {
    const { shown, rest } = foldItems(list(9), 4, false);
    expect([...shown, ...rest]).toEqual(list(9));
  });

  it('handles an empty list', () => {
    expect(foldItems([], 5, false)).toEqual({ shown: [], rest: [], folds: false });
  });
});
