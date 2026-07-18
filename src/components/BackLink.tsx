import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { accent } from '@/theme';

/** A small "‹ Back" affordance for screens reached from the You hub (or via a
 * deep link / another screen). Returns to wherever you came from, falling back
 * to the You hub when there's no history (e.g. a fresh PWA deep-link). */
export function BackLink({ label = 'Back' }: { label?: string }) {
  return (
    <Pressable
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/you'))}
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
