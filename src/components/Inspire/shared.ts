import { StyleSheet } from 'react-native';

import { radius, surface, text } from '@/theme';

/** The ivory shell every kept capture sits in, and the line shown where one would
 * be. Shared because three cards and the panel itself draw them — two style keys
 * in one place rather than the same six properties in three files. */
export const shared = StyleSheet.create({
  card: {
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    padding: 20,
    gap: 12,
  },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center', paddingHorizontal: 8 },
});
