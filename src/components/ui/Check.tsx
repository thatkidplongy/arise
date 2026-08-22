import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TAP_MIN, neutral, radius, sage, surface, text, typography } from '@/theme';

/**
 * The round tick used by every checklist — quest steps, skincare, grocery, to-dos.
 * Ticked is sage, because a done thing is safe, not urgent.
 */
export function Check({
  done,
  label,
  onPress,
  size = 26,
  color = sage[600],
  style,
}: {
  done: boolean;
  label: string;
  onPress: () => void;
  size?: number;
  color?: string;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      style={[styles.row, style]}
    >
      <Box done={done} size={size} color={color} />
      <Text style={[styles.label, done ? styles.labelDone : null]}>{label}</Text>
    </Pressable>
  );
}

/** The tick on its own, for rows that lay out their own label. */
export function Box({ done, size = 26, color = sage[600] }: { done: boolean; size?: number; color?: string }) {
  return (
    <View
      style={[
        styles.box,
        {
          width: size,
          height: size,
          borderColor: done ? color : surface.edge,
          backgroundColor: done ? color : 'transparent',
        },
      ]}
    >
      {done ? <Ionicons name="checkmark" size={Math.round(size * 0.62)} color={neutral[100]} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    minHeight: TAP_MIN,
  },
  box: {
    flexShrink: 0,
    borderWidth: 2,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.body,
    flex: 1,
    color: text.primary,
  },
  labelDone: {
    color: text.faint,
    textDecorationLine: 'line-through',
  },
});
