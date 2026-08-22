import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TAP_MIN, clay, font, neutral, radius, sage, surface, text, withAlpha } from '@/theme';

/** Small labels, tinted from the ramps. `ink` is for "now" — the one that shouts. */
export type TagTone = 'clay' | 'sage' | 'neutral' | 'outline' | 'ink';

interface Props {
  label: string;
  tone?: TagTone;
  style?: ViewStyle;
}

export function Tag({ label, tone = 'neutral', style }: Props) {
  const skin = TONES[tone];
  return (
    <View style={[styles.tag, skin.box, style]}>
      <Text style={[styles.label, { color: skin.fg }]}>{label}</Text>
    </View>
  );
}

/**
 * A tag you can tap — the focus-area chips. Selected takes the stat's own colour so
 * a screenful of them still reads as seven separate attributes.
 */
export function ChoiceChip({
  label,
  selected,
  color = clay[600],
  onPress,
}: {
  label: string;
  selected: boolean;
  color?: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected
          ? { backgroundColor: withAlpha(color, 0.14), borderColor: color }
          : { borderColor: surface.edge },
        pressed && !selected ? { backgroundColor: neutral[200] } : null,
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? color : text.secondary }]}>{label}</Text>
    </Pressable>
  );
}

const TONES: Record<TagTone, { box: ViewStyle; fg: string }> = {
  clay: { box: { backgroundColor: clay[200] }, fg: clay[800] },
  sage: { box: { backgroundColor: sage[200] }, fg: sage[800] },
  neutral: { box: { backgroundColor: neutral[200] }, fg: neutral[700] },
  outline: { box: { borderWidth: 1, borderColor: surface.edge }, fg: neutral[700] },
  ink: { box: { backgroundColor: neutral[900] }, fg: neutral[100] },
};

const styles = StyleSheet.create({
  tag: {
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  label: {
    fontFamily: font.semibold,
    fontSize: 11.5,
    lineHeight: 15,
  },
  chip: {
    minHeight: TAP_MIN - 4,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipLabel: {
    fontFamily: font.semibold,
    fontSize: 12,
    lineHeight: 16,
  },
});
