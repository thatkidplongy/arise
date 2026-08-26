import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { PortionRow } from '@/components/Food/PlateDots';
import { Kicker } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiFoodWeek, ApiPlate } from '@/lib/api';
import { PORTION, PORTION_ORDER, plateNudge, sayRange } from '@/lib/plate';
import { clay, neutral, radius, sage, shadow, space, surface, text, typography } from '@/theme';

/**
 * The day in hands — the only summary the Food screen shows.
 *
 * There is deliberately no calorie figure here. On bought food a day's estimate is
 * out by a few hundred either way, and a number that wrong shown three times a day
 * is a score people learn to play rather than a measurement. The range lives one
 * tap away on the week, where the error averages out (see the trend screen).
 */
export function PlateCard({
  plate,
  targets,
  week,
}: {
  plate: ApiPlate;
  targets: ApiPlate | null;
  week: ApiFoodWeek;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Kicker color={sage[800]}>What was on your plates</Kicker>
        <Text style={styles.blurb}>
          Measured in hands, not grams — the one method that survives eating out.
        </Text>
      </View>

      <View style={styles.rows}>
        {PORTION_ORDER.map((unit) => {
          const target = targets?.[unit] ?? 0;
          return (
            <View key={unit} style={styles.row}>
              <View style={styles.rowMain}>
                <Text style={styles.rowLabel}>{PORTION[unit].label}</Text>
                <Text style={styles.rowAim}>{PORTION[unit].aim(target)}</Text>
              </View>
              <PortionRow unit={unit} count={plate[unit]} target={target} />
            </View>
          );
        })}
      </View>

      <View style={styles.rule} />
      <Text style={styles.nudge}>{plateNudge(plate, targets)}</Text>
      <WeekLine week={week} />
    </View>
  );
}

/** The week's range, worn small at the foot of the card — and the way through to
 * the screen it belongs on. */
function WeekLine({ week }: { week: ApiFoodWeek }) {
  const said = week.logged_days
    ? `Roughly ${sayRange(week.kcal_low, week.kcal_high)} kcal a day this week.`
    : 'Log a few plates and the week starts drawing a trend.';
  return (
    <Pressable
      onPress={() => router.push('/trend')}
      accessibilityRole="link"
      accessibilityLabel="Open the weekly food trend"
      style={({ pressed }) => [styles.week, pressed && { backgroundColor: neutral[200] }]}
    >
      <Text style={styles.weekText}>
        {said} <Text style={styles.weekLink}>See the week ›</Text>
      </Text>
      <Text style={styles.weekWhy}>Kept off today on purpose — it&apos;s a trend, not a score.</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    padding: space.xl - 4,
    gap: space.md,
    ...shadow.sm,
  },
  head: { gap: 4 },
  blurb: { ...typography.small, color: text.secondary },
  rows: { gap: space.md, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  rowMain: { flex: 1, gap: 2 },
  rowLabel: { ...typography.cardTitle, color: neutral[900] },
  rowAim: { ...typography.tiny, color: text.secondary },
  rule: { height: 1, backgroundColor: surface.hairline },
  nudge: { ...typography.body, color: neutral[800] },
  week: {
    marginTop: -2,
    marginHorizontal: -8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRadius: radius.md,
    gap: 2,
  },
  weekText: { ...typography.small, color: text.secondary },
  weekLink: { ...typography.label, fontSize: 11.5, color: clay[700] },
  weekWhy: { ...typography.tiny, color: text.faint },
});
