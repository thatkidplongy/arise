import { Pressable, StyleSheet, View } from 'react-native';

import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { ALL_PILE, type Stack } from '@/lib/deck';
import { spellCount } from '@/lib/text';
import { STAT_META, accent2, clay, font, neutral, onAccent, radius, surface, text, withAlpha } from '@/theme';

/** Spine colours, rotated per stack — the muted family the design's shelf uses. */
const SPINES = [accent2, STAT_META.INT.color, STAT_META.CFT.color, STAT_META.CRE.color];

function describeDue(due: number): string {
  if (due === 0) return 'Nothing due today. Browse a stack anyway — extra meetings never hurt.';
  if (due === 1) return 'One card is due. Pick what you want to be tested on.';
  const word = spellCount(due);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)} cards are due. Pick what you want to be tested on.`;
}

/** One stack on the shelf: its spine, its counts, and what it owes today. */
function StackRow({ stack, hue, onPress }: { stack: Stack; hue: string; onPress: () => void }) {
  const resting = stack.dueLeft === 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${stack.name} — ${stack.dueLeft ? `${stack.dueLeft} due` : 'nothing due'}`}
      style={({ pressed }) => [styles.row, resting && styles.rowResting, pressed && styles.rowPressed]}
    >
      <View style={[styles.spine, { backgroundColor: withAlpha(hue, 0.28), borderColor: hue }]} />
      <View style={styles.rowText}>
        <Text style={styles.rowName} numberOfLines={1}>{stack.name}</Text>
        <Text style={styles.rowByline} numberOfLines={1}>
          {stack.total} {stack.total === 1 ? 'card' : 'cards'}
          {resting ? ' · all resting' : ''}
        </Text>
      </View>
      {resting ? (
        <Text style={styles.clear}>clear</Text>
      ) : (
        <View style={styles.dueWrap}>
          <Text style={styles.dueBadge}>{stack.dueLeft}</Text>
          <Text style={styles.dueWord}>due</Text>
        </View>
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
  rowResting: { opacity: 0.62 },
  rowPressed: { backgroundColor: surface.sageFill },
  spine: { width: 38, height: 52, borderRadius: 7, borderWidth: 1 },
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
  clear: { fontFamily: font.regular, fontSize: 11, color: text.secondary },
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
