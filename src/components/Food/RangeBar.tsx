import { StyleSheet, View } from 'react-native';

import { clay, radius, sage, surface, withAlpha } from '@/theme';

/** The window a range is drawn inside. Shared across a set of bars so they can be
 * compared — see `scaleAcross`. */
export interface RangeScale {
  min: number;
  max: number;
}

/**
 * A range against a band — 15a's comparison, which was always the point: not
 * "you ate 2,240" but "what you probably ate overlaps what you're aiming for".
 *
 * The band is the wide sage pill; the estimate is the narrower clay pill drawn
 * over it, translucent so the overlap is what you see. Neither is a line you fail
 * at, which is why nothing here turns red.
 */
export function RangeBar({
  low,
  high,
  bandLow,
  bandHigh,
  scale,
  compact = false,
}: {
  low: number;
  high: number;
  bandLow: number;
  bandHigh: number;
  /** Pass a shared scale when several bars sit in a column: a bar drawn to its own
   * scale can't be compared with the one above it, which is the whole job of a
   * day-by-day strip. */
  scale?: RangeScale | null;
  compact?: boolean;
}) {
  const window = scale ?? scaleAcross([{ low, high }], bandLow, bandHigh);
  const band = span(bandLow, bandHigh, window);
  const estimate = span(low, high, window);
  const height = compact ? 9 : 14;

  return (
    <View style={[styles.track, { height: compact ? 13 : 20 }]}>
      <View style={[styles.rule, { top: compact ? 5 : 8 }]} />
      {band ? (
        <View
          style={[styles.band, { left: band.left, width: band.width, height, top: compact ? 2 : 3 }]}
        />
      ) : null}
      {estimate ? (
        <View
          style={[
            styles.estimate,
            { left: estimate.left, width: estimate.width, height: height - 4, top: compact ? 4 : 5 },
          ]}
        />
      ) : null}
    </View>
  );
}

/** One window wide enough for every range in a set, with a little air on each side
 * so a range sitting at the very edge still reads as a range. */
export function scaleAcross(
  ranges: { low: number; high: number }[],
  bandLow: number,
  bandHigh: number,
): RangeScale | null {
  const values = [bandLow, bandHigh, ...ranges.flatMap((r) => [r.low, r.high])].filter((n) => n > 0);
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = Math.max(120, (max - min) * 0.12);
  return { min: Math.max(0, min - pad), max: max + pad };
}

function span(from: number, to: number, scale: RangeScale | null) {
  if (!scale || to <= 0 || scale.max <= scale.min) return null;
  const width = scale.max - scale.min;
  const start = Math.max(from, scale.min);
  return {
    left: percent(((start - scale.min) / width) * 100),
    width: percent(((Math.min(to, scale.max) - start) / width) * 100),
  };
}

/** Typed as a percentage so it satisfies react-native's DimensionValue. */
function percent(n: number): `${number}%` {
  return `${n}%`;
}

const styles = StyleSheet.create({
  track: { width: '100%', justifyContent: 'center' },
  rule: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: surface.muted,
  },
  band: { position: 'absolute', borderRadius: radius.pill, backgroundColor: sage[200] },
  estimate: {
    position: 'absolute',
    borderRadius: radius.pill,
    backgroundColor: withAlpha(clay[500], 0.8),
  },
});
