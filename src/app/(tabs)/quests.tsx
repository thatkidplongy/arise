import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { QuestCard } from '@/components/QuestCard';
import { ReadingReview } from '@/components/ReadingReview';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, surface, text, withAlpha } from '@/theme';

export default function QuestsScreen() {
  const state = useSystem((s) => s.state);
  const toggleRest = useSystem((s) => s.toggleRest);
  const [pending, setPending] = useState(false);

  if (!state) {
    return (
      <Screen>
        <ConnectionPanel />
      </Screen>
    );
  }

  const daily = state.quests.filter((q) => q.cadence === 'daily');
  const weekly = state.quests.filter((q) => q.cadence === 'weekly');
  const side = state.quests.filter((q) => q.cadence === 'side');
  const isResting = state.today.resting;

  const onRest = async () => {
    if (pending) return;
    setPending(true);
    await toggleRest();
    setPending(false);
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Quest board</Text>
        <Text style={styles.todayXp}>{state.today.xp} XP today</Text>
      </View>

      <ReadingReview />

      <SystemPanel
        title="Daily quests"
        sub={
          isResting
            ? 'Resting today 🌙'
            : state.today.cleared
              ? 'Every area today 🌱'
              : 'Do what you can — showing up is the win'
        }
      >
        <View style={styles.list}>
          {daily.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>

      <SystemPanel title="Weekly quests" sub="New set each Monday">
        <View style={styles.list}>
          {weekly.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>

      <SystemPanel title="Side quests" sub="Optional · whenever you feel like it">
        <View style={styles.list}>
          {side.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>

      {/* Rest is part of the path — never a failure. */}
      <Pressable
        onPress={onRest}
        disabled={pending}
        style={({ pressed }) => [
          styles.rest,
          isResting && styles.restOn,
          (pressed || pending) && { opacity: 0.85 },
        ]}
      >
        {pending ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <>
            <Text style={[styles.restTitle, isResting && { color: feedback.success }]}>
              {isResting ? 'You’re resting today 🌙' : 'Take a rest day'}
            </Text>
            <Text style={styles.restSub}>
              {isResting
                ? 'Your streak is safe. Tap to undo.'
                : 'Not feeling it? Rest still counts — your streak stays.'}
            </Text>
          </>
        )}
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  h1: {
    color: text.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  todayXp: {
    color: feedback.success,
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    gap: 8,
  },
  rest: {
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 11,
    borderStyle: 'dashed',
    paddingVertical: 14,
    paddingHorizontal: 12,
    minHeight: 64,
    justifyContent: 'center',
  },
  restOn: {
    borderStyle: 'solid',
    backgroundColor: withAlpha(feedback.success, 0.06),
    borderColor: withAlpha(feedback.success, 0.4),
  },
  restTitle: {
    color: text.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  restSub: {
    color: text.faint,
    fontSize: 12,
    textAlign: 'center',
  },
});
