import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Kicker } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiQuest } from '@/lib/api';
import { neutral, radius, sage, space, surface, text, typography } from '@/theme';

/**
 * Today's Fuel quest, on the screen where it's actually answered.
 *
 * It shows the marks rather than the quest's title, because the marks are the
 * thing you check a plate against — and they're deliberately in hands, so every
 * one of them can be answered honestly at a restaurant table. Ticking still
 * happens on Quests: this card is the reminder, not a second place to complete
 * the same quest from.
 */
export function FuelQuestCard({ quest }: { quest: ApiQuest }) {
  const done = quest.steps_done.filter(Boolean).length;
  // The floor's second step is the day's marks; the first is "log every plate",
  // which this screen is already the answer to.
  const marks = quest.steps[1] ?? quest.steps[0] ?? quest.desc;
  return (
    <Pressable
      onPress={() => router.push('/quests')}
      accessibilityRole="link"
      accessibilityLabel={`Today's Fuel quest: ${marks}`}
      style={({ pressed }) => [styles.card, pressed && { backgroundColor: sage[200] }]}
    >
      <View style={styles.head}>
        <Kicker color={sage[800]}>Today&apos;s quest · Body</Kicker>
        <Text style={styles.count}>
          {done} of {quest.steps.length}
        </Text>
      </View>
      <Text style={styles.marks}>{marks}</Text>
      <Text style={styles.why}>Answerable at any table, without a scale.</Text>
      <Text style={styles.go}>Tick it off on Quests ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface.sagePatch,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  count: { ...typography.label, color: sage[800], marginLeft: 'auto' },
  marks: { ...typography.heading, color: neutral[900] },
  why: { ...typography.small, color: text.onSage },
  go: { ...typography.label, fontSize: 11.5, color: sage[800], marginTop: -4 },
});
