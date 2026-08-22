import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { DataTable, type Column } from '@/components/DataTable';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiHistoryItem } from '@/lib/api';
import { dateKey, shortDay } from '@/lib/dates';
import { useHistory } from '@/query/useHistory';
import type { StatKey } from '@/types';
import { STAT_META, STAT_TINT, neutral, radius, text, typography, withAlpha } from '@/theme';

const CADENCE_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', side: 'Side' };
const FALLBACK = { color: text.faint, icon: 'ellipse-outline' as const, label: 'Quest' };

export default function HistoryScreen() {
  const { history, loading } = useHistory();
  const today = dateKey();

  const columns: Column<ApiHistoryItem>[] = [
    {
      key: 'cat',
      width: 32,
      render: (it) => {
        const meta = STAT_META[it.stat as StatKey] ?? FALLBACK;
        return (
          <View style={[styles.iconBox, { backgroundColor: withAlpha(meta.color, STAT_TINT) }]}>
            <Ionicons name={meta.icon} size={14} color={meta.color} />
          </View>
        );
      },
    },
    {
      key: 'quest',
      header: 'Quest',
      render: (it) => {
        const meta = STAT_META[it.stat as StatKey] ?? FALLBACK;
        const cadence = CADENCE_LABEL[it.cadence] ?? '';
        return (
          <>
            <Text style={styles.title} numberOfLines={1}>
              {it.title}
            </Text>
            <Text style={styles.sub}>{cadence ? `${meta.label} · ${cadence}` : meta.label}</Text>
          </>
        );
      },
    },
    {
      key: 'day',
      header: 'Date',
      width: 56,
      align: 'right',
      render: (it) => <Text style={styles.date}>{shortDay(it.day, today)}</Text>,
    },
    {
      key: 'xp',
      header: 'XP',
      width: 54,
      align: 'right',
      render: (it) => {
        const meta = STAT_META[it.stat as StatKey] ?? FALLBACK;
        return <Text style={[styles.xp, { color: meta.color }]}>+{it.xp}</Text>;
      },
    },
  ];

  return (
    <Screen>
      <BackLink />
      <ScreenTitle>Quest history</ScreenTitle>
      <ScreenBlurb>Every quest you&apos;ve finished — most recent first. Rest days are in here too; they count.</ScreenBlurb>

      {history.length === 0 ? (
        <SystemPanel>
          <Text style={styles.empty}>
            {loading ? 'Loading…' : 'No finished quests yet. Complete one and it lands here.'}
          </Text>
        </SystemPanel>
      ) : (
        <DataTable
          columns={columns}
          rows={history}
          keyExtractor={(it) => it.id}
          title="All time"
          sub={`${history.length}`}
          collapsible
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  empty: { ...typography.body, color: text.secondary },
  iconBox: { width: 30, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  title: { ...typography.cardTitle, fontSize: 13, color: neutral[900] },
  sub: { ...typography.tiny, color: text.faint, marginTop: 2 },
  date: { ...typography.label, fontSize: 12, color: text.secondary },
  xp: { ...typography.numeral, fontSize: 15, includeFontPadding: false },
});
