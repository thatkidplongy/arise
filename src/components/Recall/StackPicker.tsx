import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ALL_PILE, type Stack } from '@/lib/deck';
import { initialsOf, spellCount } from '@/lib/text';
import {
  STAT_META,
  accent2,
  clay,
  deepen,
  font,
  neutral,
  onAccent,
  radius,
  surface,
  text,
  withAlpha,
} from '@/theme';

/** Spine colours, rotated per stack — the muted family the design's shelf uses. */
const SPINES = [accent2, STAT_META.INT.color, STAT_META.CFT.color, STAT_META.CRE.color];

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
      <View style={[styles.binding, { backgroundColor: hue }]} />
      <Text style={[styles.spineLabel, { color: deepen(hue) }]} numberOfLines={1}>
        {initialsOf(name)}
      </Text>
    </View>
  );
}

function describeDue(due: number): string {
  if (due === 0) return 'Nothing scheduled today — tap any stack to test yourself anyway.';
  if (due === 1) return 'One card is ready to be tested today. Or tap any stack to go further.';
  const word = spellCount(due);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} cards are ready to be tested today. Pick a stack.`;
}

/**
 * One stack on the shelf: its spine, how many cards it holds, and whether the
 * schedule is asking for any today.
 *
 * A stack with nothing due is never dimmed and never labelled with a verb. It used
 * to be greyed at 0.62 with "clear" on the right, which read as a disabled row with
 * a button on it — and it is neither: every stack opens, whether or not it owes
 * anything, because testing yourself early is always allowed.
 */
function StackRow({ stack, hue, onPress }: { stack: Stack; hue: string; onPress: () => void }) {
  const askingToday = stack.dueLeft > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={
        askingToday
          ? `${stack.name} — ${stack.dueLeft} of ${stack.total} cards ready to test today`
          : `${stack.name} — ${stack.total} cards, none scheduled today`
      }
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
    >
      <StackSpine name={stack.name} hue={hue} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{stack.name}</Text>
        <Text style={styles.rowByline} numberOfLines={1}>
          {stack.total} {stack.total === 1 ? 'card' : 'cards'}
          {askingToday ? '' : ' · none scheduled today'}
        </Text>
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

/**
 * Step one of a recall sitting: pick the stack. A mixed pile gives you no context
 * to pull on — a kana straight after a system-design idea drills neither — so one
 * source at a time is the default, and the mix is a deliberate opt-in at the
 * bottom, harder on purpose.
 */
export function StackPicker({
  stacks,
  dueLeft,
  onPick,
}: {
  stacks: Stack[];
  dueLeft: number;
  onPick: (pile: string) => void;
}) {
  return (
    <Card style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Try to recall</Text>
        <Text style={styles.blurb}>{describeDue(dueLeft)}</Text>
      </View>

      <View style={styles.shelf}>
        {stacks.map((s, n) => (
          <StackRow key={s.name} stack={s} hue={SPINES[n % SPINES.length]} onPress={() => onPick(s.name)} />
        ))}
      </View>

      <View style={styles.orRow}>
        <View style={styles.orLine} />
        <Text style={styles.orWord}>or</Text>
        <View style={styles.orLine} />
      </View>

      <Pressable
        onPress={() => onPick(ALL_PILE)}
        accessibilityRole="button"
        accessibilityLabel="Mix every stack together"
        style={({ pressed }) => [styles.mix, pressed && styles.mixPressed]}
      >
        <Text style={styles.mixLabel}>
          {dueLeft > 1 ? `Mix all ${spellCount(dueLeft)} · harder on purpose` : 'Mix everything · harder on purpose'}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14 },
  head: { gap: 5, paddingHorizontal: 4, paddingTop: 2 },
  title: { fontFamily: font.display, fontSize: 24, lineHeight: 27, letterSpacing: -0.4, color: neutral[900] },
  blurb: { fontFamily: font.regular, fontSize: 12.5, lineHeight: 19, color: text.secondary },
  shelf: { gap: 9 },
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
    alignItems: 'center',
    justifyContent: 'flex-end',
    // Left padding clears the binding, so the label centres on the page block.
    paddingLeft: 8,
    paddingRight: 3,
    paddingBottom: 5,
    overflow: 'hidden',
  },
  // The binding is its own strip rather than a wider left border: iOS won't render a
  // border that differs per side once the corners are rounded.
  binding: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4 },
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
  orRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 },
  orLine: { flex: 1, height: 1, backgroundColor: surface.hairline },
  orWord: { fontFamily: font.regular, fontSize: 11, color: text.secondary },
  mix: {
    minHeight: 46,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: surface.edge,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mixPressed: { backgroundColor: surface.muted },
  mixLabel: { fontFamily: font.semibold, fontSize: 12.5, color: neutral[800] },
});
