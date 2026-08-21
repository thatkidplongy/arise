import { describe, expect, it } from 'vitest';

import { peso } from '@/lib/money';

describe('peso', () => {
  it('groups thousands and drops absent centavos', () => {
    expect(peso(20900)).toBe('₱20,900');
    expect(peso(0)).toBe('₱0');
  });

  it('keeps centavos where there are any, to two places', () => {
    expect(peso(1234.5)).toBe('₱1,234.5');
    expect(peso(1234.567)).toBe('₱1,234.57');
  });

  it('puts the sign ahead of the symbol, not between it and the digits', () => {
    // The balance headline read "₱-20,900" while the tracker's net read "−₱20,900".
    expect(peso(-20900)).toBe('−₱20,900');
    expect(peso(-20900)).not.toContain('₱-');
  });

  it('signs a negative once, so a caller passing net straight through reads right', () => {
    expect([...peso(-20900)].filter((c) => c === '−')).toHaveLength(1);
  });
});
