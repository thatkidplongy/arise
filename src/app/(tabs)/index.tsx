import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { RankBadge } from '@/components/RankBadge';
import { Screen } from '@/components/Screen';
import { StatRow } from '@/components/StatRow';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { DAILY_QUESTS } from '@/data/quests';
import { dateKey } from '@/lib/dates';
import { levelInfo, nextGate, rankFor } from '@/lib/leveling';
import { countToday, currentStreak, maxStreak, xpOnDay } from '@/lib/selectors';
import { useSystem } from '@/store/useSystem';
import { colors, STAT_KEYS } from '@/theme';

export default function StatusScreen() {
  const name = useSystem((s) => s.name);
  const title = useSystem((s) => s.equippedTitle);
  const totalXp = useSystem((s) => s.totalXp);
  const log = useSystem((s) => s.log);

  const info = levelInfo(totalXp);
  const streak = currentStreak(log);
  const best = maxStreak(log);
  const rank = rankFor(info.level, best);
  const gate = nextGate(info.level, best);
  const todayXp = xpOnDay(log, dateKey());
  const dailiesDone = DAILY_QUESTS.filter((q) => countToday(log, q.id) >= q.target).length;

  return (
    <Screen>
      <Text style={styles.wordmark}>A R I S E</Text>

      <SystemPanel title="STATUS">
        <View style={styles.identityRow}>
          <RankBadge rank={rank} />
          <View style={styles.identity}>
            <Text style={styles.name}>{name}</Text>
            {title ? <Text style={styles.title}>「{title}」</Text> : null}
            <Text style={styles.meta}>Hunter · Level {info.level}</Text>
          </View>
        </View>

        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>XP</Text>
          <Text style={styles.xpValue}>
            {info.into.toLocaleString()} / {info.needed.toLocaleString()}
          </Text>
        </View>
        <XpBar value={info.into} max={info.needed} height={10} />

        <View style={styles.chips}>
          <View style={styles.chip}>
            <Ionicons name="flame" size={14} color={colors.gold} />
            <Text style={styles.chipText}>{streak} day streak</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="ribbon" size={14} color={colors.primary} />
            <Text style={styles.chipText}>best {best}</Text>
          </View>
          <View style={styles.chip}>
            <Ionicons name="sparkles" size={14} color={colors.success} />
            <Text style={styles.chipText}>+{todayXp} XP today</Text>
          </View>
        </View>
      </SystemPanel>

      <SystemPanel title="ATTRIBUTES">
        {STAT_KEYS.map((k) => (
          <StatRow key={k} stat={k} />
        ))}
      </SystemPanel>

      <SystemPanel title="TODAY" sub={dailiesDone === DAILY_QUESTS.length ? 'CLEARED' : undefined}>
        <View style={styles.xpRow}>
          <Text style={styles.xpLabel}>Daily quests</Text>
          <Text style={styles.xpValue}>
            {dailiesDone} / {DAILY_QUESTS.length}
          </Text>
        </View>
        <XpBar
          value={dailiesDone}
          max={DAILY_QUESTS.length}
          color={dailiesDone === DAILY_QUESTS.length ? colors.success : colors.primary}
        />
      </SystemPanel>

      {gate ? (
        <SystemPanel title="NEXT RANK">
          <Text style={styles.gateHeading}>Rank {gate.rank} requirements</Text>
          <Text style={styles.gateLine}>
            • Reach Level {gate.level} <Text style={styles.gateNow}>(now {info.level})</Text>
          </Text>
          <Text style={styles.gateLine}>
            • Best streak of {gate.streak} days <Text style={styles.gateNow}>(now {best})</Text>
          </Text>
        </SystemPanel>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  wordmark: {
    color: colors.primaryBright,
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 8,
    marginBottom: 2,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 14,
  },
  identity: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '800',
  },
  title: {
    color: colors.gold,
    fontSize: 13,
    fontWeight: '600',
  },
  meta: {
    color: colors.textDim,
    fontSize: 13,
  },
  xpRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  xpLabel: {
    color: colors.textDim,
    fontSize: 12,
    letterSpacing: 1,
  },
  xpValue: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  chips: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  chipText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '600',
  },
  gateHeading: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 6,
  },
  gateLine: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 22,
  },
  gateNow: {
    color: colors.textDim,
  },
});
