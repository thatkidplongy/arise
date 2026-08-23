import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import type { RecallGrade } from '@/lib/api';
import { clay, font, neutral, onAccent, radius, sage, surface, text } from '@/theme';

/** When this grade would bring the card back. Spelled with the verb, because a bare
 * "in 3 days" on a button reads like a delay being imposed rather than the next
 * meeting being booked. */
function describeReturn(days: number): string {
  if (days === 1) return 'back tomorrow';
  return `back in ${days} days`;
}

/** One of the three piles a graded card can land in. */
function GradeButton({
  label,
  sub,
  emphasis,
  onPress,
}: {
  label: string;
  sub: string;
  emphasis: 'plain' | 'soft' | 'filled';
  onPress: () => void;
}) {
  const skin = SKINS[emphasis];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label} — ${sub}`}
      style={({ pressed }) => [styles.button, skin.box, pressed && styles.pressed]}
    >
      <Text style={[styles.label, skin.text]}>{label}</Text>
      <Text style={[styles.sub, skin.text]}>{sub}</Text>
    </Pressable>
  );
}

/**
 * The index-card sort, with each pile's meaning written on it: every button says
 * when the card would come back, so grading is a choice about your own schedule
 * rather than a verdict sent into the dark. "Got it" carries the visual weight —
 * it's the honest default for a card you answered, not a reward.
 */
export function GradeBar({
  ifMissed,
  ifShaky,
  ifGot,
  onGrade,
}: {
  ifMissed: number;
  ifShaky: number;
  ifGot: number;
  onGrade: (grade: RecallGrade) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.ask}>How close were you? Your answer sets when you see this card again.</Text>
      <View style={styles.row}>
        <GradeButton label="Missed" sub={describeReturn(ifMissed)} emphasis="plain" onPress={() => onGrade('missed')} />
        <GradeButton label="Shaky" sub={describeReturn(ifShaky)} emphasis="soft" onPress={() => onGrade('shaky')} />
        <GradeButton label="Got it" sub={describeReturn(ifGot)} emphasis="filled" onPress={() => onGrade('got')} />
      </View>
    </View>
  );
}

const SKINS = {
  plain: {
    box: { borderWidth: 1, borderColor: surface.edge } as const,
    text: { color: neutral[900] } as const,
  },
  soft: {
    box: { borderWidth: 1, borderColor: clay[500], backgroundColor: clay[100] } as const,
    text: { color: clay[800] } as const,
  },
  filled: {
    box: { backgroundColor: sage[700] } as const,
    text: { color: onAccent } as const,
  },
};

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  ask: { fontFamily: font.regular, fontSize: 11.5, lineHeight: 17, color: text.secondary, paddingLeft: 4 },
  row: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    minHeight: 62,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  pressed: { opacity: 0.85 },
  label: { fontFamily: font.semibold, fontSize: 12.5 },
  sub: { fontFamily: font.regular, fontSize: 9.5 },
});
