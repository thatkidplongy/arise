import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { ShelfStack } from '@/lib/deck';
import { initialsOf } from '@/lib/text';
import { STAT_META, accent2, clay, deepen, font, neutral, onAccent, radius, surface, text, withAlpha } from '@/theme';

/** Spine colours, rotated per stack — the muted family the design's shelf uses. */
const SPINES = [accent2, STAT_META.INT.color, STAT_META.CFT.color, STAT_META.CRE.color];

/** Which spine a stack gets: its place on the shelf, so a book keeps one colour for
 * as long as the shelf holds still. */
export function spineFor(index: number): string {
  return SPINES[index % SPINES.length];
}

/**
 * The stack's spine, as the design sheet draws it (12a): a squared binding edge on
 * the left, rounded fore-edge on the right, and the material's initials stamped low
 * on it the way a real spine is labelled.
 *
 * It shipped as the tint and nothing else — no binding, no label, corners even all
 * round — and a bare colour block beside a title reads as a cover image that failed
 * to load. The label is what makes it a book instead of a placeholder.
 */
function StackSpine({ name, hue }: { name: string; hue: string }) {
  return (
    <View style={[styles.spine, { backgroundColor: withAlpha(hue, 0.2), borderColor: hue }]}>
      <Text style={[styles.spineLabel, { color: deepen(hue) }]} numberOfLines={1}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/**
 * One stack on the shelf: its spine, the line the deck writes about it, and whether
 * the schedule is asking for any of it today.
 *
 * A stack with nothing due is never dimmed and never labelled with a verb. It used
 * to be greyed at 0.62 with "clear" on the right, which read as a disabled row with
 * a button on it — and it is neither: every stack opens, whether or not it owes
 * anything, because testing yourself early is always allowed.
 */
export function StackRow({ stack, hue, onPress }: { stack: ShelfStack; hue: string; onPress: () => void }) {
  const askingToday = stack.dueLeft > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        askingToday
          ? `${stack.name} — ${stack.dueLeft} of ${stack.total} cards ready to test today`
          : `${stack.name} — ${stack.total} ${stack.total === 1 ? 'card' : 'cards'}, none scheduled today`
      }
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <StackSpine name={stack.name} hue={hue} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{stack.name}</Text>
        <Text style={styles.rowByline} numberOfLines={1}>{stack.byline}</Text>
      </View>
      {askingToday ? (
        <View style={styles.dueWrap}>
          <Text style={styles.dueBadge}>{stack.dueLeft}</Text>
          <Text style={styles.dueWord}>to test</Text>
        </View>
      ) : (
        <Text style={styles.browse}>test early</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: 76,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: surface.muted,
  },
  rowPressed: { backgroundColor: surface.sageFill },
  spine: {
    width: 40,
    height: 54,
    // Squared at the binding, rounded at the fore-edge — which way the book faces.
    borderTopLeftRadius: 5,
    borderBottomLeftRadius: 5,
    borderTopRightRadius: 9,
    borderBottomRightRadius: 9,
    borderWidth: 1,
    borderLeftWidth: 5,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 3,
    paddingBottom: 5,
    overflow: 'hidden',
  },
  spineLabel: { fontFamily: font.display, fontSize: 10, lineHeight: 11.5, letterSpacing: 0.4, textAlign: 'center' },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowName: { fontFamily: font.semibold, fontSize: 14.5, color: neutral[900] },
  rowByline: { fontFamily: font.regular, fontSize: 11.5, color: text.secondary },
  dueWrap: { alignItems: 'center', gap: 2 },
  dueBadge: {
    minWidth: 30,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: clay[700],
    color: onAccent,
    fontFamily: font.semibold,
    fontSize: 12,
    textAlign: 'center',
    overflow: 'hidden',
  },
  dueWord: { fontFamily: font.regular, fontSize: 9.5, color: text.secondary },
  browse: { fontFamily: font.semibold, fontSize: 11, color: text.secondary },
});
