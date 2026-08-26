import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { addDays, formatDayChip, weekdayDay } from '@/lib/dates';
import { TAP_MIN, clay, neutral, radius, surface, text, typography } from '@/theme';

/**
 * ‹ Today ›. A plate you forgot at lunch is still worth logging at midnight, and a
 * log that only accepts the present hour quietly teaches you not to bother.
 *
 * Forward stops at `today`: there is no honest way to record a meal you haven't
 * eaten, and a day ahead would only ever show an empty screen.
 */
export function DayNav({ day, today, onChange }: { day: string; today: string; onChange: (next: string) => void }) {
  const ahead = day >= today;
  return (
    <View style={styles.row}>
      <Arrow
        icon="chevron-back"
        label="Previous day"
        onPress={() => onChange(addDays(day, -1))}
      />
      <View style={styles.middle}>
        <Text style={styles.title}>{formatDayChip(day, today)}</Text>
        <Text style={styles.sub}>{weekdayDay(day)}</Text>
      </View>
      <Arrow
        icon="chevron-forward"
        label="Next day"
        disabled={ahead}
        onPress={() => onChange(addDays(day, 1))}
      />
    </View>
  );
}

function Arrow({
  icon,
  label,
  onPress,
  disabled = false,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.arrow,
        pressed && !disabled ? { backgroundColor: clay[200] } : null,
        disabled ? styles.off : null,
      ]}
    >
      <Ionicons name={icon} size={17} color={neutral[800]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  arrow: {
    width: TAP_MIN,
    height: TAP_MIN,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: surface.muted,
  },
  off: { opacity: 0.35 },
  middle: { flex: 1, alignItems: 'center', gap: 1 },
  title: { ...typography.heading, color: neutral[900] },
  sub: { ...typography.small, color: text.secondary },
});
