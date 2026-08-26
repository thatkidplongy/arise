import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { PlateDots } from '@/components/Food/PlateDots';
import { Text } from '@/components/ui/Text';
import type { ApiUsual } from '@/lib/api';
import { TAP_MIN, clay, neutral, radius, shadow, space, surface, text, typography } from '@/theme';

/**
 * The plates you've logged before, one tap each.
 *
 * Eating out means the same eight places, so a repeat meal shouldn't cost a fresh
 * estimate — it should cost a tap, already measured. The chip still opens the
 * sheet rather than logging straight away: today's serving might not be last
 * week's, and the portions are yours to correct.
 */
export function UsualsRow({ usuals, onPick }: { usuals: ApiUsual[]; onPick: (usual: ApiUsual) => void }) {
  if (usuals.length === 0) return null;
  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <Text style={styles.title}>Your usuals</Text>
        <Text style={styles.hint}>plates you&apos;ve logged before</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {usuals.map((usual) => (
          <Pressable
            key={usual.name}
            onPress={() => onPick(usual)}
            accessibilityRole="button"
            accessibilityLabel={`Log ${usual.name} again`}
            style={({ pressed }) => [styles.chip, pressed && { backgroundColor: clay[100] }]}
          >
            <Text style={styles.chipLabel} numberOfLines={1}>
              {usual.name}
            </Text>
            <PlateDots plate={usual} size={8} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  head: { flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingHorizontal: 4 },
  title: { ...typography.heading, color: neutral[900] },
  hint: { ...typography.small, color: text.secondary, marginLeft: 'auto' },
  row: { gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  chip: {
    minHeight: TAP_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: surface.hairline,
    ...shadow.sm,
  },
  chipLabel: { ...typography.label, color: neutral[900], maxWidth: 180 },
});
