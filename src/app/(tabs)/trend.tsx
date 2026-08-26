import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { PlateDots } from '@/components/Food/PlateDots';
import { RangeBar, scaleAcross, type RangeScale } from '@/components/Food/RangeBar';
import { Screen } from '@/components/Screen';
import { Kicker, ScreenBlurb, ScreenTitle, SectionTitle } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiFoodWeek, ApiFoodWeekDay, ApiTargets } from '@/lib/api';
import { dateKey, weekdayDay } from '@/lib/dates';
import { bandConfidence, bandVerdict, sayRange } from '@/lib/plate';
import { useBody } from '@/query/useBody';
import { clay, neutral, radius, sage, shadow, space, surface, text, typography, withAlpha } from '@/theme';

/**
 * The week — the one screen in the app that talks in calories.
 *
 * It's here rather than on Food because a single day's estimate off bought food is
 * out by a few hundred either way, and a figure that wrong shown three times a day
 * becomes a score to play. Across a week the independent errors cancel, and what's
 * left is a range worth comparing against your band — which was always the
 * comparison that mattered.
 */
export default function FoodTrendScreen() {
  const day = dateKey();
  const { body, refetch } = useBody(day);

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  if (!body) {
    return (
      <Screen>
        <BackLink label="Food" to="/body" />
        <ScreenTitle>The week</ScreenTitle>
      </Screen>
    );
  }

  const { week } = body;

  return (
    <Screen>
      <BackLink label="Food" to="/body" />
      <ScreenTitle>The week</ScreenTitle>
      <ScreenBlurb>
        Seven days of plates, turned into calories once — where a week&apos;s worth of guessing
        averages out.
      </ScreenBlurb>

      <WeekCard week={week} />
      <DayStrip week={week} today={day} />
      {body.targets ? <BodyCard targets={body.targets} /> : null}

      <Text style={styles.caveat}>
        Every figure here is estimated from hand portions, so treat it as a direction, not a
        measurement. It is not nutrition or medical advice.
      </Text>
    </Screen>
  );
}

function WeekCard({ week }: { week: ApiFoodWeek }) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Kicker color={sage[800]}>{bandVerdict(week)}</Kicker>
        <View style={styles.figureRow}>
          <Text style={styles.figure}>{sayRange(week.kcal_low, week.kcal_high)}</Text>
          <Text style={styles.unit}>kcal a day</Text>
        </View>
      </View>

      <RangeBar
        low={week.kcal_low}
        high={week.kcal_high}
        bandLow={week.band_low}
        bandHigh={week.band_high}
      />

      <View style={styles.legend}>
        <Swatch color={sage[200]} label={week.band_high ? `your band ${sayRange(week.band_low, week.band_high)}` : 'no band yet'} />
        <Swatch color={withAlpha(clay[500], 0.8)} label="this week's estimate" />
      </View>
      <Text style={styles.confidence}>{bandConfidence(week)}</Text>

      <View style={styles.rule} />
      <View style={styles.macros}>
        <Macro label="Protein" low={week.protein_low} high={week.protein_high} />
        <Macro label="Fibre" low={week.fibre_low} high={week.fibre_high} />
      </View>
    </View>
  );
}

function Swatch({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.swatchRow}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text style={styles.swatchLabel}>{label}</Text>
    </View>
  );
}

function Macro({ label, low, high }: { label: string; low: number; high: number }) {
  return (
    <View style={styles.macro}>
      <Text style={styles.macroLabel}>{label}</Text>
      <Text style={styles.macroValue}>{`${sayRange(low, high)} g`}</Text>
      <Text style={styles.macroSub}>a day, give or take</Text>
    </View>
  );
}

/** The seven days as their own ranges — where a heavy day sat, and which ones
 * never got logged at all.
 *
 * Every row is drawn to one shared scale. A bar scaled to its own day would put a
 * light day and a heavy one in the same place on the line, which is the opposite
 * of what a strip like this is for.
 */
function DayStrip({ week, today }: { week: ApiFoodWeek; today: string }) {
  const scale = scaleAcross(
    week.days.filter((d) => d.logged).map((d) => ({ low: d.kcal_low, high: d.kcal_high })),
    week.band_low,
    week.band_high,
  );
  return (
    <View style={styles.strip}>
      <SectionTitle>Day by day</SectionTitle>
      {week.days.map((entry) => (
        <DayRow key={entry.day} entry={entry} week={week} today={today} scale={scale} />
      ))}
    </View>
  );
}

function DayRow({
  entry,
  week,
  today,
  scale,
}: {
  entry: ApiFoodWeekDay;
  week: ApiFoodWeek;
  today: string;
  scale: RangeScale | null;
}) {
  const name = entry.day === today ? 'Today' : weekdayDay(entry.day);
  return (
    <View style={styles.dayRow}>
      <Text style={styles.dayName}>{name}</Text>
      <View style={styles.dayMiddle}>
        {entry.logged ? (
          <RangeBar
            low={entry.kcal_low}
            high={entry.kcal_high}
            bandLow={week.band_low}
            bandHigh={week.band_high}
            scale={scale}
            compact
          />
        ) : (
          <Text style={styles.dayEmpty}>not logged</Text>
        )}
      </View>
      {entry.logged ? <PlateDots plate={entry} size={7} /> : null}
    </View>
  );
}

/** The body context the daily screen no longer carries: where the band came from. */
function BodyCard({ targets }: { targets: ApiTargets }) {
  return (
    <View style={styles.body}>
      <Kicker>Where the band comes from</Kicker>
      <Text style={styles.bodyLine}>
        BMI {targets.bmi} · {targets.bmi_category} · a healthy weight for your height is{' '}
        {targets.healthy_low}–{targets.healthy_high} kg
        {targets.goal_weight ? ` · aiming for ${targets.goal_weight} kg` : ''}
      </Text>
      <Text style={styles.bodySub}>
        {targets.bmr.toLocaleString()} kcal at rest, {targets.tdee.toLocaleString()} with your usual
        week. Edit any of it on Food.
      </Text>
    </View>
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
  head: { gap: 5 },
  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  figure: { ...typography.numeral, fontSize: 33, lineHeight: 36, color: neutral[900] },
  unit: { ...typography.small, color: text.secondary },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginTop: -4 },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 10, borderRadius: 3 },
  swatchLabel: { ...typography.tiny, color: text.secondary },
  confidence: { ...typography.small, color: neutral[800] },
  rule: { height: 1, backgroundColor: surface.hairline },
  macros: { flexDirection: 'row', gap: 18 },
  macro: { flex: 1, gap: 3 },
  macroLabel: { ...typography.label, color: neutral[800] },
  macroValue: { ...typography.numeral, fontSize: 17, color: neutral[900] },
  macroSub: { ...typography.tiny, color: text.secondary },
  strip: { gap: space.sm },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  dayName: { ...typography.label, width: 62, color: neutral[800] },
  dayMiddle: { flex: 1, justifyContent: 'center' },
  dayEmpty: { ...typography.tiny, color: text.faint },
  body: {
    backgroundColor: surface.muted,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: 5,
  },
  bodyLine: { ...typography.body, color: neutral[900] },
  bodySub: { ...typography.small, color: text.secondary },
  caveat: { ...typography.tiny, color: text.faint, paddingHorizontal: 4 },
});
