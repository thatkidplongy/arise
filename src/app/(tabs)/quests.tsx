import { StyleSheet, Text, View } from 'react-native';

import { QuestCard } from '@/components/QuestCard';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { DAILY_CLEAR_BONUS, DAILY_QUESTS, SIDE_QUESTS, WEEKLY_QUESTS } from '@/data/quests';
import { dateKey } from '@/lib/dates';
import { countToday, xpOnDay } from '@/lib/selectors';
import { useSystem } from '@/store/useSystem';
import { colors } from '@/theme';

export default function QuestsScreen() {
  const log = useSystem((s) => s.log);
  const todayXp = xpOnDay(log, dateKey());
  const cleared = DAILY_QUESTS.every((q) => countToday(log, q.id) >= q.target);

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>QUEST BOARD</Text>
        <Text style={styles.todayXp}>+{todayXp} XP today</Text>
      </View>

      <SystemPanel
        title="DAILY QUESTS"
        sub={cleared ? 'Cleared — bonus granted' : `Clear all 5 for +${DAILY_CLEAR_BONUS} XP`}
      >
        <View style={styles.list}>
          {DAILY_QUESTS.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>

      <SystemPanel title="WEEKLY QUESTS" sub="Resets every Monday">
        <View style={styles.list}>
          {WEEKLY_QUESTS.map((q) => (
            <QuestCard key={q.id} quest={q} />
          ))}
        </View>
      </SystemPanel>

      <SystemPanel title="SIDE QUESTS" sub="Optional · once per day">
        <View style={styles.list}>
          {SIDE_QUESTS.map((q) => (
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
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  h1: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
  },
  todayXp: {
    color: colors.success,
    fontSize: 13,
    fontWeight: '700',
  },
  list: {
    gap: 8,
  },
});
