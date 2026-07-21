import { Ionicons } from '@expo/vector-icons';
import { type Href, router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { accent } from '@/theme';

/** A small "‹ Back" affordance for screens reached from a hub. Pass `to` to name
 * where it returns — needed inside the Tabs navigator, where router.back() drops
 * you on the initial tab (Status) rather than the hub you actually came from.
 * Without `to` it falls back to history, then the You hub. */
export function BackLink({ label = 'Back', to = '/you' }: { label?: string; to?: Href }) {
  return (
    <Pressable
      onPress={() => router.replace(to)}
      style={({ pressed }) => [styles.wrap, pressed && { opacity: 0.6 }]}
      hitSlop={8}
    >
      <Ionicons name="chevron-back" size={18} color={accent} />
      <Text style={styles.text}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 1, marginBottom: 6 },
  text: { color: accent, fontSize: 14, fontWeight: '600' },
});
