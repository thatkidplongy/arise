import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { DailyQuestWindow } from '@/components/DailyQuestWindow';
import { PriorityBoard } from '@/components/PriorityCard';
import { QuestCard } from '@/components/QuestCard';
import { ReadingReview } from '@/components/ReadingReview';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Disc } from '@/components/ui/StatChip';
import { Counter, SectionRule } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import type { ApiQuest } from '@/lib/api';
import { DAY_BLOCKS, blockOf, currentBlockKey } from '@/lib/routine';
import { useSystem } from '@/store/useSystem';
import { STAT_META, clay, neutral, radius, sage, surface, text, typography } from '@/theme';

/** The one the System is asking for now: the first open daily in this block, else
 * the first open daily anywhere, else the first — a cleared window still reads. */
function pickFeatured(daily: ApiQuest[], nowKey: string): ApiQuest | undefined {
  const open = daily.filter((q) => q.done < q.target);
  return open.find((q) => blockOf(q.stat, q.title) === nowKey) ?? open[0] ?? daily[0];
}

/** A weekly quest, as a gate: a ringed attribute, its reward, and where you're up to. */
function Gate({ quest }: { quest: ApiQuest }) {
  const meta = STAT_META[quest.stat];
  const cleared = quest.done >= quest.target;
  return (
    <View style={styles.gate}>
      <View style={[styles.gateRing, { borderColor: meta.color }]}>
        <Text style={[styles.gateKey, { color: meta.color }]}>{quest.stat}</Text>
      </View>
      <View style={styles.gateBody}>
        <Text style={styles.gateTitle}>{quest.title}</Text>
        <Text style={styles.gateSub}>
          {meta.label} · the week&apos;s raid
        </Text>
      </View>
      <View style={styles.gateRight}>
        <Text style={styles.gateXp}>{quest.xp}</Text>
        <Counter
          done={Math.min(quest.done, quest.target)}
          total={quest.target}
          color={cleared ? sage[700] : text.secondary}
        />
      </View>
    </View>
  );
}

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

  const nowKey = currentBlockKey(new Date().getHours());
  const featured = isResting ? undefined : pickFeatured(daily, nowKey);

  // The featured quest already has the window, so its block shows the rest.
  const rest = daily.filter((q) => q.id !== featured?.id);
  const dailyBlocks = DAY_BLOCKS.map((block) => ({
    block,
    items: rest.filter((q) => blockOf(q.stat, q.title) === block.key),
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

      {featured ? <DailyQuestWindow quest={featured} /> : null}

      <ReadingReview />

      <PriorityBoard priorities={state.priorities} />

      {dailyBlocks.length ? <SectionRule label="The rest of today" /> : null}

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

      {weekly.length ? (
        <>
          <SectionRule label="Gates open this week" trailing="New set each Monday" />
          {weekly.map((q) => (
            <Gate key={q.id} quest={q} />
          ))}
        </>
      ) : null}

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
  gate: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: surface.card,
  },
  gateRing: {
    width: 48,
    height: 48,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateKey: { ...typography.label, fontSize: 11 },
  gateBody: { flex: 1, minWidth: 0, gap: 3 },
  gateTitle: { ...typography.cardTitle, fontSize: 13.5, color: neutral[900] },
  gateSub: { ...typography.small, color: text.secondary },
  gateRight: { alignItems: 'flex-end', gap: 3 },
  gateXp: { ...typography.numeral, fontSize: 17, color: clay[700], includeFontPadding: false },
});
