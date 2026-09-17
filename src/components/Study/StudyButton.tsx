import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TAP_MIN, onAccent, press, radius, surface, text, withAlpha } from '@/theme';

/**
 * The study card's own action pill.
 *
 * Not the shared `Button`: that one wears the app's clay accent, and this card is
 * tinted by whichever attribute today's subject feeds — Craft blue on Monday, Grow
 * teal on Tuesday, Creativity amber on Thursday. The hue is the point, so the button
 * takes it as a prop rather than reaching for a constant.
 */
export function StudyButton({
  label,
  hue,
  onPress,
  disabled = false,
}: {
  label: string;
  hue: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.btn,
        styles.wide,
        { backgroundColor: hue, borderColor: hue },
        disabled && { backgroundColor: withAlpha(hue, 0.35), borderColor: 'transparent' },
        pressed && { opacity: press.soft },
      ]}
    >
      <Text style={styles.primaryText}>{label}</Text>
    </Pressable>
  );
}

/** The quiet half of a pair — "not yet" beside "yes, move on". */
export function StudyQuietButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.btn, pressed && { opacity: press.medium }]}
    >
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  wide: { paddingVertical: 11 },
  btnText: { color: text.secondary, fontSize: 13, fontWeight: '600' },
  primaryText: { color: onAccent, fontSize: 13, fontWeight: '700' },
});
