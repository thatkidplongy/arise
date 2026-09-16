import { describe, expect, it } from 'vitest';

import { noteCount } from '@/lib/noteLimit';

describe('noteCount', () => {
  it('stays quiet while the limit is nowhere in sight', () => {
    expect(noteCount(0, 8000)).toEqual({ show: false });
    expect(noteCount(4000, 8000)).toEqual({ show: false });
  });

  it('speaks up with room left to finish the thought', () => {
    const c = noteCount(7000, 8000);
    expect(c).toMatchObject({ show: true, over: false });
    expect(c.show && c.label).toBe('1,000 characters left');
  });

  it('says how far over rather than how much is left', () => {
    const c = noteCount(8120, 8000);
    expect(c).toMatchObject({ show: true, over: true });
    expect(c.show && c.label).toBe('120 over the limit — trim it to save');
  });

  it('shows an over-long note its true state however far past the cap it is', () => {
    // A note written before the cap was lowered opens over it — it must say so
    // rather than silently losing the tail to the server's trim on save.
    expect(noteCount(5000, 3000)).toMatchObject({ show: true, over: true });
  });

  it('counts exactly at the cap as still saveable', () => {
    expect(noteCount(8000, 8000)).toMatchObject({ show: true, over: false });
  });
});
