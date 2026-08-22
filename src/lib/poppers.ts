/**
 * The geometry of a burst of poppers.
 *
 * Deliberately deterministic: the same index always produces the same flight, so a
 * burst renders identically on every pass. `Math.random` would give a livelier
 * scatter and cost more than it's worth — the static web export renders this tree
 * at build time, and a piece that lands somewhere different on the client is one
 * more hydration mismatch for nothing.
 */

/** A stable pseudo-random 0–1 from an index and a salt. Not cryptography — just a
 * spread that looks unplanned and never changes between renders. */
function scatter(index: number, salt: number): number {
  const n = Math.sin(index * 12.9898 + salt * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

/** One piece's whole flight, fixed before it ever animates. */
export interface Popper {
  /** Where it starts across the burst, 0 (left edge) to 1 (right). */
  from: number;
  /** How far it drifts sideways over the flight, in px — signed. */
  drift: number;
  /** How high it climbs, in px. */
  rise: number;
  /** Degrees of spin across the flight — signed, so they don't all turn one way. */
  spin: number;
  /** Edge length in px. */
  size: number;
  /** Share of the flight it waits before starting, 0–0.3. */
  delay: number;
  /** Index into the palette the caller passes. */
  tone: number;
}

/**
 * `count` pieces spread across the burst.
 *
 * They start evenly across the width and are nudged from there rather than placed
 * at random: an even base means no gaps and no clumps, and the nudge is what stops
 * it reading as a row.
 */
export function piecesFor(count: number, tones: number): Popper[] {
  if (count < 1 || tones < 1) return [];
  return Array.from({ length: count }, (_, i) => {
    const base = count === 1 ? 0.5 : i / (count - 1);
    const nudge = (scatter(i, 1) - 0.5) * 0.12;
    return {
      from: Math.min(1, Math.max(0, base + nudge)),
      // Pieces near the edges drift outward, so the burst opens instead of rising
      // as a column. The centre barely moves.
      drift: Math.round((base - 0.5) * 150 + (scatter(i, 2) - 0.5) * 40),
      rise: Math.round(70 + scatter(i, 3) * 70),
      spin: Math.round((scatter(i, 4) - 0.5) * 720),
      size: Math.round(7 + scatter(i, 5) * 5),
      delay: Math.round(scatter(i, 6) * 30) / 100,
      tone: i % tones,
    };
  });
}
