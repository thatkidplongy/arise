import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlateDots } from '@/components/Food/PlateDots';
import { SectionTitle } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiFoodEntry, EntrySource, MealSlot } from '@/lib/api';
import { clockLabel, isPlate, mealTitle, plateOf, slotLabel } from '@/lib/plate';
import { TAP_MIN, clay, neutral, radius, sage, space, surface, text, typography } from '@/theme';

/**
 * The day as it was eaten, in order, with an open row for the meal still ahead.
 *
 * A row says what was on the plate, draws its portions, and — since a plate may
 * now arrive already priced by something outside the app — says where its figures
 * came from. Provenance is not decoration: a badge is the difference between a
 * number the app read off a printed panel and one a model guessed from a photo,
 * and a row that hides that difference is a row that lies by omission. Hand-counted
 * plates carry no badge at all, because claiming nothing is the honest default.
 */
export function MealTimeline({
  entries,
  openSlot,
  invitation,
  onAdd,
  onRemove,
}: {
  entries: ApiFoodEntry[];
  /** The meal the day is still waiting on, or null when looking at a past day. */
  openSlot: MealSlot | null;
  /** One line under the open row — what would close today out. */
  invitation: string;
  onAdd: (slot: MealSlot) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <SectionTitle>Your meals</SectionTitle>
        <Text style={styles.count}>
          {entries.length ? `${entries.length} logged` : 'nothing logged yet'}
        </Text>
      </View>

      {entries.map((entry, i) => (
        <MealRow key={entry.id} entry={entry} first={i === 0} onRemove={() => onRemove(entry.id)} />
      ))}

      {openSlot ? (
        <OpenRow
          slot={openSlot}
          invitation={invitation}
          first={entries.length === 0}
          onPress={() => onAdd(openSlot)}
        />
      ) : null}
    </View>
  );
}

function MealRow({ entry, first, onRemove }: { entry: ApiFoodEntry; first: boolean; onRemove: () => void }) {
  const plate = plateOf(entry);
  const clock = clockLabel(entry.at_time);
  const badge = SOURCE_BADGE[entry.source];
  return (
    <View style={styles.row}>
      <View style={[styles.rail, { backgroundColor: sage[300] }]} />
      <View style={[styles.body, first ? null : styles.divided]}>
        <Text style={styles.clock}>{clock}</Text>
        <View style={styles.main}>
          <View style={styles.titleRow}>
            <Text style={styles.title} numberOfLines={1}>
              {mealTitle(entry)}
            </Text>
            {badge ? (
              <View style={[styles.badge, { backgroundColor: badge.fill }]}>
                <Text style={[styles.badgeText, { color: badge.ink }]}>{badge.label}</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.detail} numberOfLines={1}>
            {rowDetail(entry)}
          </Text>
        </View>
        {isPlate(plate) ? <PlateDots plate={plate} /> : null}
        <RowFigure entry={entry} />
        <Pressable
          onPress={onRemove}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${mealTitle(entry)}`}
          style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}
        >
          <Ionicons name="close" size={15} color={text.faint} />
        </Pressable>
      </View>
    </View>
  );
}

/** How each provenance reads on a row. Clay for an estimate, sage for a printed
 * label — the same division the rest of the app uses between what is being counted
 * and what is being relied on. A hand-counted plate ('') has no entry here: it
 * gets no badge, because it makes no claim. */
const SOURCE_BADGE: Record<EntrySource, { label: string; fill: string; ink: string } | null> = {
  claude: { label: 'PHOTO', fill: surface.clayFill, ink: clay[800] },
  photo: { label: 'PHOTO', fill: surface.clayFill, ink: clay[800] },
  label: { label: 'LABEL', fill: surface.sageFill, ink: sage[900] },
  '': null,
};

/**
 * The row's own figure, as a range.
 *
 * Never a bare number on an estimated plate: `kcal_low`–`kcal_high` comes from the
 * server's portion table, and on a plate of hands that span is several hundred
 * kcal wide. Printing its midpoint alone would turn an honest guess into a false
 * measurement, which is the one thing this screen must not do. A label-read row
 * has grams behind it, so its span collapses and it reads as the single figure it
 * genuinely is.
 */
function RowFigure({ entry }: { entry: ApiFoodEntry }) {
  if (!entry.kcal_high) return null;
  const exact = entry.kcal_low === entry.kcal_high;
  return (
    <View style={styles.figure}>
      <Text style={styles.figureMain}>
        {exact
          ? entry.kcal_high.toLocaleString()
          : `~${Math.round((entry.kcal_low + entry.kcal_high) / 2).toLocaleString()}`}
      </Text>
      <Text style={styles.figureSpan}>
        {exact
          ? 'kcal'
          : `${entry.kcal_low.toLocaleString()}–${entry.kcal_high.toLocaleString()}`}
      </Text>
    </View>
  );
}

/** What sits under a meal's title: the plate's own words, or — for a packaged food
 * that came with real numbers — the numbers it came with. A plate handed over from
 * Claude says so, because "who estimated this" is part of reading the row. */
function rowDetail(entry: ApiFoodEntry): string {
  const via = entry.source === 'claude' ? ' · via Claude' : '';
  if (isPlate(plateOf(entry))) {
    return `${entry.slot ? entry.name : entry.place || entry.name}${via}`;
  }
  if (entry.kcal) return `${entry.protein_g}g protein${via}`;
  return `${entry.name}${via}`;
}

function OpenRow({
  slot,
  invitation,
  first,
  onPress,
}: {
  slot: MealSlot;
  invitation: string;
  first: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Log ${slotLabel(slot).toLowerCase()}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
    >
      <View style={[styles.rail, { backgroundColor: clay[400] }]} />
      <View style={[styles.body, first ? null : styles.divided]}>
        <Text style={[styles.clock, { color: clay[700] }]}>now</Text>
        <View style={styles.main}>
          <Text style={styles.title}>{slotLabel(slot)}</Text>
          <Text style={[styles.detail, { color: clay[700] }]}>{invitation}</Text>
        </View>
        <Ionicons name="add" size={19} color={clay[700]} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 0 },
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    paddingHorizontal: 4,
    paddingBottom: space.sm,
  },
  count: { ...typography.small, color: text.secondary, marginLeft: 'auto' },
  row: { flexDirection: 'row', gap: 13, alignItems: 'stretch' },
  rail: { width: 4, borderRadius: radius.pill },
  body: {
    flex: 1,
    minHeight: TAP_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
  },
  divided: { borderTopWidth: 1, borderTopColor: surface.hairline },
  clock: {
    ...typography.kicker,
    // '7a', not '7A'. The kicker preset shouts by default; a clock shouldn't.
    textTransform: 'none',
    letterSpacing: 0.6,
    width: 32,
    color: text.secondary,
  },
  main: { flex: 1, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: { ...typography.cardTitle, color: neutral[900], flexShrink: 1 },
  detail: { ...typography.small, color: text.secondary },
  badge: { borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  badgeText: { ...typography.kicker, fontSize: 8.5, lineHeight: 12, letterSpacing: 0.9 },
  figure: { alignItems: 'flex-end', gap: 1 },
  figureMain: { ...typography.numeral, fontSize: 13, lineHeight: 15, color: neutral[900] },
  figureSpan: { ...typography.tiny, color: text.secondary },
  remove: { paddingLeft: 2 },
});
