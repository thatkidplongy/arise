import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { STAT_META, radius, surface, text, withAlpha } from '@/theme';

const TONE = STAT_META.WLT.color;

/**
 * One selectable pill in a row of choices — a direction, a bucket, a day.
 *
 * Not Tag, which is a label that only reports; this one is a control and carries the
 * selected state a screen reader needs. 36pt of box plus 6pt of hitSlop clears the
 * 44pt target without stacking three tall rows into a form that also has inputs.
 */
export function ChoiceChip({
  label,
  on,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [styles.chip, on && styles.chipOn, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <Text style={[styles.text, on && styles.textOn]}>{label}</Text>
    </Pressable>
  );
}

/** The row choices sit in — wraps, because a week of days won't fit one phone line. */
export function ChoiceRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
  },
  chipOn: { borderColor: TONE, backgroundColor: withAlpha(TONE, 0.1) },
  text: { color: text.faint, fontSize: 12, fontWeight: '600' },
  textOn: { color: TONE },
});
