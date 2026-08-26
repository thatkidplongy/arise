import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { PlateDots } from '@/components/Food/PlateDots';
import { SectionTitle } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiFoodEntry, MealSlot } from '@/lib/api';
import { clockLabel, isPlate, mealTitle, plateOf, slotLabel } from '@/lib/plate';
import { TAP_MIN, clay, neutral, radius, sage, space, surface, text, typography } from '@/theme';

/**
 * The day as it was eaten, in order, with an open row for the meal still ahead.
 *
 * A row says what was on the plate and draws its portions; the numbers only appear
 * on the one kind of row that genuinely has them — a packaged food logged off its
 * own label.
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
  return (
    <View style={styles.row}>
      <View style={[styles.rail, { backgroundColor: sage[300] }]} />
      <View style={[styles.body, first ? null : styles.divided]}>
        <Text style={styles.clock}>{clock}</Text>
        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={1}>
            {mealTitle(entry)}
          </Text>
          <Text style={styles.detail} numberOfLines={1}>
            {rowDetail(entry)}
          </Text>
        </View>
        {isPlate(plate) ? <PlateDots plate={plate} /> : null}
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

/** What sits under a meal's title: the plate's own words, or — for a packaged food
 * that came with real numbers — the numbers it came with. */
function rowDetail(entry: ApiFoodEntry): string {
  if (isPlate(plateOf(entry))) return entry.slot ? entry.name : entry.place || entry.name;
  if (entry.kcal) return `${entry.kcal.toLocaleString()} kcal · ${entry.protein_g}g protein`;
  return entry.name;
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
  title: { ...typography.cardTitle, color: neutral[900] },
  detail: { ...typography.small, color: text.secondary },
  remove: { paddingLeft: 2 },
});
