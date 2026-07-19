import { StyleSheet, Text, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { CurrentBookCard } from '@/components/CurrentBookCard';
import { DAY_BLOCKS, blockOf, currentBlockKey } from '@/lib/routine';
import { QuestCard } from '@/components/QuestCard';
import { ReadingReview } from '@/components/ReadingReview';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, text, withAlpha } from '@/theme';

export default function QuestsScreen() {
  const state = useSystem((s) => s.state);

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

  // Group the daily quests into soft time-blocks and mark the one for right now,
  // so the board reads as a rhythm — "what fits this moment" — not a flat list.
  const nowKey = currentBlockKey(new Date().getHours());
  const dailyBlocks = DAY_BLOCKS.map((block) => ({
    block,
    items: daily.filter((q) => blockOf(q.stat, q.title) === block.key),
  })).filter((g) => g.items.length > 0);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Quest board</Text>
        <Text style={styles.todayXp}>{state.today.xp} XP today</Text>
      </View>

      <ReadingReview />

      <Text style={styles.rhythmNote}>
        {isResting
          ? 'Resting today 🌙 — your streak is safe'
          : state.today.cleared
            ? 'Every area today 🌱'
            : 'Your day in blocks — do what fits the moment'}
      </Text>

      {dailyBlocks.map(({ block, items }) => {
        const isNow = !isResting && block.key === nowKey;
        const allDone = items.every((q) => q.done >= q.target);
        return (
          <SystemPanel
            key={block.key}
            title={block.label}
            sub={isNow ? 'Now' : allDone ? 'Done 🌱' : ''}
            style={isNow ? styles.nowBlock : undefined}
            collapsible
          >
            <View style={styles.list}>
              {items.map((q) => (
                <QuestCard key={q.id} quest={q} />
              ))}
            </View>
          </SystemPanel>
        );
      })}

      <SystemPanel title="Weekly quests" sub="New set each Monday" collapsible>
        <View style={styles.list}>
          {weekly.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>

      <SystemPanel title="Side quests" sub="Optional · whenever you feel like it" collapsible>
        <View style={styles.list}>
          {side.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>

      {/* Reading is the Grow floor — set/browse your book right by its quests. */}
      <CurrentBookCard />
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
  rhythmNote: {
    color: text.faint,
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: -4,
    marginBottom: 2,
  },
  nowBlock: {
    borderColor: withAlpha(accent, 0.55),
    backgroundColor: withAlpha(accent, 0.05),
  },
});
