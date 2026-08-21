import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';

/** WCAG 2.5.5 — anything tappable clears 44pt. */
const TAP = 44;

/**
 * The control at the foot of a folded list: a chevron, and a line saying what's still
 * hidden. Shared so two folded lists can't drift on which way the chevron points or
 * on what a screen reader hears.
 *
 * `label` stays the caller's, because what's worth naming differs — a hidden bill
 * that still needs paying has to say so, where a hidden ledger line only has to be
 * counted. `total` is separate from it so the spoken label can be uniform even when
 * the visible one isn't.
 */
export function FoldToggle({
  expanded,
  label,
  total,
  color,
  onPress,
  style,
}: {
  expanded: boolean;
  label: string;
  total: number;
  color: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.btn, style]}
      accessibilityRole="button"
      accessibilityLabel={expanded ? 'Show fewer lines' : `Show all ${total} lines`}
    >
      <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={color} />
      <Text style={[styles.text, { color }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: TAP,
  },
  text: { fontSize: 12, fontWeight: '600' },
});
