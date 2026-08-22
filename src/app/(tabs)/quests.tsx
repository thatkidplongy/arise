import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { PriorityBoard } from '@/components/PriorityCard';
import { QuestCard } from '@/components/QuestCard';
import { ReadingReview } from '@/components/ReadingReview';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Disc } from '@/components/ui/StatChip';
import { Text } from '@/components/ui/Text';
import { DAY_BLOCKS, blockOf, currentBlockKey } from '@/lib/routine';
import { useSystem } from '@/store/useSystem';
import { clay, neutral, text, typography } from '@/theme';

export default function QuestsScreen() {
  const state = useSystem((s) => s.state);

  // Bump on each visit to the tab so the time-block panels re-mount and re-apply
  // their collapsed default — a finished block folds itself away every time you
  // land here, while you can still open any block by hand during the visit.
  const [visit, setVisit] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setVisit((v) => v + 1);
    }, []),
  );

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
        <Text style={styles.h1}>Quest{'\n'}board</Text>
        <Disc
          value={`${state.today.dailies_done}/${state.today.dailies_total}`}
          caption="areas"
          size={82}
          tone="sage"
        />
      </View>

      <Text style={styles.rhythmNote}>
        {isResting
          ? 'Resting today — your streak is safe.'
          : state.today.cleared
            ? 'Every area today.'
            : 'Your day in blocks — do what fits the moment.'}
      </Text>

      <ReadingReview />

      <PriorityBoard priorities={state.priorities} />

      {dailyBlocks.map(({ block, items }) => {
        const isNow = !isResting && block.key === nowKey;
        const allDone = items.every((q) => q.done >= q.target);
        return (
          <SystemPanel
            key={`${block.key}-${visit}`}
            title={block.label}
            badge={isNow ? { label: 'Now', tone: 'ink' } : allDone ? { label: 'Cleared', tone: 'sage' } : undefined}
            style={isNow ? styles.nowBlock : undefined}
            collapsible
            defaultCollapsed={allDone}
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

      <SystemPanel title="Side quests" sub="Optional · whenever" collapsible>
        <View style={styles.list}>
          {side.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingTop: 6,
    paddingHorizontal: 2,
  },
  h1: {
    ...typography.screenTitle,
    flex: 1,
    lineHeight: 33,
    color: neutral[900],
  },
  todayXp: {
    ...typography.label,
    color: text.secondary,
  },
  list: {
    gap: 10,
  },
  rhythmNote: {
    ...typography.body,
    color: text.secondary,
    fontStyle: 'italic',
    marginTop: -8,
    paddingLeft: 2,
  },
  nowBlock: {
    backgroundColor: clay[100],
  },
});
