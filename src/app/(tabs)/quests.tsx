import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { PriorityBoard } from '@/components/PriorityCard';
import { QuestCard } from '@/components/QuestCard';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { NorthStarCard } from '@/components/NorthStarCard';
import { XpBar } from '@/components/XpBar';
import { Disc, StatChip } from '@/components/ui/StatChip';
import { SectionRule } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import { useWide } from '@/hooks/useWide';
import type { ApiQuest, ApiState } from '@/lib/api';
import { DAY_BLOCKS, blockOf, currentBlockKey } from '@/lib/routine';
import { useSystem } from '@/store/useSystem';
import { STAT_META, clay, neutral, radius, surface, text, typography } from '@/theme';

/** The one the System is asking for now: the first open daily in this block, else
 * the first open daily anywhere, else the first — a cleared window still reads. */
function pickFeatured(daily: ApiQuest[], nowKey: string): ApiQuest | undefined {
  const open = daily.filter((q) => q.done < q.target);
  return open.find((q) => blockOf(q.stat, q.title) === nowKey) ?? open[0] ?? daily[0];
}

/**
 * On a wide window the single column unstacks: the board keeps the left, and what
 * was above it on a phone — where you're up to, the North Star, the attributes —
 * moves beside it, where it can stay in view instead of being scrolled past.
 * Nothing new is added; it's the same payload.
 */
function Aside({ state }: { state: ApiState }) {
  const { player, today, stats, progression } = state;
  return (
    <View style={styles.aside}>
      <View style={styles.asideCard}>
        <View style={styles.asideHead}>
          <Disc value={player.level} caption="level" size={62} />
          <View style={styles.asideHeadCopy}>
            <Text style={styles.asideToday}>
              {today.dailies_done} of {today.dailies_total} today
            </Text>
            <Text style={styles.asideXp}>
              {player.xp_into.toLocaleString()} / {player.xp_needed.toLocaleString()} XP
            </Text>
          </View>
        </View>
        <XpBar value={player.xp_into} max={player.xp_needed} height={10} track={clay[200]} />
      </View>

      <NorthStarCard northStar={player.north_star} quote={state.daily_quote} />

      <View style={styles.asideCard}>
        <Text style={styles.asideTitle}>Attributes</Text>
        {stats.map((stat) => {
          const meta = STAT_META[stat.key];
          return (
            <View key={stat.key} style={styles.asideStat}>
              <StatChip statKey={stat.key} size={32} />
              <Text style={styles.asideStatLabel}>{meta.label}</Text>
              <Text style={[styles.asideStatLevel, { color: meta.color }]}>
                Lv {progression?.[stat.key]?.level ?? 0}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export default function QuestsScreen() {
  const state = useSystem((s) => s.state);
  const wide = useWide();

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

  // Study quests live on the Learn tab now; the board keeps body & life.
  const boardQuests = state.quests.filter((q) => q.home !== 'learn');
  const daily = boardQuests.filter((q) => q.cadence === 'daily');
  const weekly = boardQuests.filter((q) => q.cadence === 'weekly');
  const side = boardQuests.filter((q) => q.cadence === 'side');
  const isResting = state.today.resting;

  const nowKey = currentBlockKey(new Date().getHours());
  const featured = isResting ? undefined : pickFeatured(daily, nowKey);

  // The featured quest already has the window, so its block shows the rest.
  const rest = daily.filter((q) => q.id !== featured?.id);
  const dailyBlocks = DAY_BLOCKS.map((block) => ({
    block,
    items: rest.filter((q) => blockOf(q.stat, q.title) === block.key),
  })).filter((g) => g.items.length > 0);

  const board = (
    <>
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

      {featured ? <QuestCard quest={featured} featured /> : null}


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
            style={styles.blockPanel}
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
          {/* The same card the dailies use, not a summary row: a weekly quest is
              something you tick, write on and undo, so it needs the whole card. */}
          <View style={styles.list}>
            {weekly.map((q) => (
              <QuestCard key={q.id} quest={q} />
            ))}
          </View>
        </>
      ) : null}

      <SystemPanel title="Side quests" sub="Optional · whenever" collapsible style={styles.blockPanel}>
        <View style={styles.list}>
          {side.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>
    </>
  );

  if (!wide) return <Screen>{board}</Screen>;

  return (
    <Screen>
      <View style={styles.split}>
        <View style={styles.boardColumn}>{board}</View>
        <Aside state={state} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: 20 },
  boardColumn: { flex: 1.35, minWidth: 0, gap: 16 },
  aside: { flex: 1, minWidth: 0, gap: 16 },
  asideCard: { backgroundColor: surface.card, borderRadius: radius.lg, padding: 20, gap: 12 },
  asideHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  asideHeadCopy: { flex: 1, minWidth: 0, gap: 3 },
  asideToday: { ...typography.numeral, fontSize: 20, color: neutral[900], includeFontPadding: false },
  asideXp: { ...typography.small, color: text.secondary },
  asideTitle: { ...typography.heading, color: neutral[900] },
  asideStat: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingVertical: 3 },
  asideStatLabel: { ...typography.label, flex: 1, minWidth: 0, color: neutral[800] },
  asideStatLevel: { ...typography.label, fontSize: 11.5 },
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
    gap: 14,
  },
  rhythmNote: {
    ...typography.body,
    color: text.secondary,
    fontStyle: 'italic',
    marginTop: -8,
    paddingLeft: 2,
  },
  // Each quest is its own window now, so the block is a heading and nothing more —
  // a card around the cards would be a third frame on the same content.
  blockPanel: {
    backgroundColor: 'transparent',
    paddingHorizontal: 2,
    paddingTop: 4,
    paddingBottom: 0,
  },
});
