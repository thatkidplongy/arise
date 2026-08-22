import { describe, expect, it } from 'vitest';

import { piecesFor } from '@/lib/poppers';

describe('piecesFor', () => {
  it('makes one piece per count', () => {
    expect(piecesFor(14, 4)).toHaveLength(14);
  });

  it('is deterministic, so a burst renders the same on every pass', () => {
    expect(piecesFor(8, 4)).toEqual(piecesFor(8, 4));
  });

  it('spreads them across the whole width without leaving it', () => {
    const pieces = piecesFor(12, 4);
    expect(pieces.every((p) => p.from >= 0 && p.from <= 1)).toBe(true);
    expect(Math.min(...pieces.map((p) => p.from))).toBeLessThan(0.2);
    expect(Math.max(...pieces.map((p) => p.from))).toBeGreaterThan(0.8);
  });

  it('opens outward — the left half drifts left, the right half right', () => {
    const pieces = piecesFor(12, 4);
    expect(pieces[0].drift).toBeLessThan(0);
    expect(pieces[11].drift).toBeGreaterThan(0);
  });

  it('always climbs, and always has something to draw', () => {
    const pieces = piecesFor(20, 4);
    expect(pieces.every((p) => p.rise > 0)).toBe(true);
    expect(pieces.every((p) => p.size > 0)).toBe(true);
  });

  it('holds every piece inside the flight, so none starts after it ends', () => {
    expect(piecesFor(20, 4).every((p) => p.delay >= 0 && p.delay <= 0.3)).toBe(true);
  });

  it('uses every tone before repeating one', () => {
    expect(new Set(piecesFor(4, 4).map((p) => p.tone)).size).toBe(4);
  });

  it('centres a single piece rather than pinning it to an edge', () => {
    expect(piecesFor(1, 4)[0].from).toBeCloseTo(0.5, 1);
  });

  it('is empty rather than broken on a nonsense burst', () => {
    expect(piecesFor(0, 4)).toEqual([]);
    expect(piecesFor(-3, 4)).toEqual([]);
    expect(piecesFor(10, 0)).toEqual([]);
  });
});
