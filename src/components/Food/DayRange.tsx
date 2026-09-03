import { StyleSheet, View } from 'react-native';

import { RangeBar, scaleAcross } from '@/components/Food/RangeBar';
import { Kicker } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiFoodDay } from '@/lib/api';
import { neutral, radius, sage, shadow, space, surface, text, typography } from '@/theme';

/**
 * The day as a range against the band.
 *
 * This is the range-native answer to a problem the app used to solve by
 * subtraction: if most meals are bought, a figure like "2,240 kcal" implies a
 * scale nobody has, so the old screen showed no daily calories at all. But the
 * honest error on a restaurant plate is a *span*, not a secret — and a span shown
 * against the band you're aiming for is the comparison that was always meant.
 * "1,420–1,970, probably inside your band" claims exactly as much as the data
 * supports, which is why it can live on the day where a point figure could not.
 *
 * Three rules hold it honest. It is never a single number. It is never a verdict —
 * "probably", always, because portions turned into calories cannot support more.
 * And it is the same estimate the weekly trend is built from, so the day and the
 * week can never contradict each other.
 */
export function DayRange({ food, open }: { food: ApiFoodDay; open: boolean }) {
  // Nothing logged is not a zero-calorie day; it is a day with nothing to say yet.
  if (!food.entries.length) return null;

  const banded = food.band_high > 0;
  const scale = scaleAcross(
    [{ low: food.kcal_low, high: food.kcal_high }],
    food.band_low,
    food.band_high,
  );

  return (
    <View style={styles.card}>
      <Kicker color={sage[800]}>{banded ? standing(food) : 'Your day so far'}</Kicker>
      <View style={styles.figureRow}>
        <Text style={styles.figure}>
          {food.kcal_low.toLocaleString()}–{food.kcal_high.toLocaleString()}
        </Text>
        <Text style={styles.unit}>kcal</Text>
      </View>
      {banded ? (
        <RangeBar
          low={food.kcal_low}
          high={food.kcal_high}
          bandLow={food.band_low}
          bandHigh={food.band_high}
          scale={scale}
        />
      ) : null}
      <Text style={styles.note}>{banded ? room(food, open) : UNBANDED}</Text>
    </View>
  );
}

const UNBANDED = 'Set a body profile and this gets a band to sit against.';

/**
 * Where the day stands, as a probability.
 *
 * A range that overlaps the band cannot be called a miss in either direction —
 * that is the whole reason the comparison is drawn as two spans rather than a
 * number against a line.
 */
function standing(food: ApiFoodDay): string {
  if (food.kcal_low > food.band_high) return 'Probably above your band';
  if (food.kcal_high < food.band_low) return 'Probably under your band';
  return 'Probably inside your band';
}

/**
 * How much room is left, said as the span it is.
 *
 * With a meal still ahead the interesting figure is the room, not the total — and
 * the room is itself a range, because the day's own estimate is. Once the day is
 * closed there is no room to report, so it says where the day sat instead.
 */
function room(food: ApiFoodDay, open: boolean): string {
  if (!open) {
    if (food.kcal_low > food.band_high) return 'Above the band, on an estimate this wide.';
    if (food.kcal_high < food.band_low) return 'Under the band, with the day closed out.';
    return 'The day overlaps your band — which is as close as an estimate gets.';
  }
  const most = food.band_high - food.kcal_low;
  const least = food.band_high - food.kcal_high;
  if (most <= 0) return 'Already past the band, with a meal still to come.';
  if (least <= 0) {
    return `Up to ${most.toLocaleString()} of room left, depending where the day really landed.`;
  }
  return `${least.toLocaleString()} to ${most.toLocaleString()} of room, with a meal still to come.`;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 7,
    ...shadow.sm,
  },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  figure: { ...typography.numeral, fontSize: 26, lineHeight: 29, color: neutral[900] },
  unit: { ...typography.small, color: text.secondary },
  note: { ...typography.small, color: text.secondary },
});
