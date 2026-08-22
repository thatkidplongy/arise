import { Ionicons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TAP_MIN, clay, neutral, radius, typography } from '@/theme';

/** A "‹ You" pill for screens reached from a hub. Pass `to` to name where it
 * returns — needed inside the Tabs navigator, where router.back() drops you on the
 * initial tab (Status) rather than the hub you actually came from. Without `to` it
 * falls back to the You hub. */
export function BackLink({ label = 'You', to = '/you' }: { label?: string; to?: Href }) {
  return (
    <Pressable
      onPress={() => router.replace(to)}
      accessibilityRole="button"
      style={({ pressed }) => [styles.wrap, pressed && { backgroundColor: clay[200] }]}
    >
      <Ionicons name="chevron-back" size={16} color={neutral[800]} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: TAP_MIN,
    paddingLeft: 13,
    paddingRight: 18,
    borderRadius: radius.pill,
    backgroundColor: neutral[200],
  },
  text: { ...typography.label, color: neutral[800] },
});
