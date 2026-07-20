import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { DataTable, type Column } from '@/components/DataTable';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import type { ApiHistoryItem } from '@/lib/api';
import { dateKey, shortDay } from '@/lib/dates';
import { useHistory } from '@/query/useHistory';
import type { StatKey } from '@/types';
import { STAT_META, text, withAlpha } from '@/theme';

const CADENCE_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', side: 'Side' };
const FALLBACK = { color: text.faint, icon: 'ellipse-outline' as const, label: 'Quest' };

export default function HistoryScreen() {
  const { history, loading } = useHistory();
  const today = dateKey();

  const columns: Column<ApiHistoryItem>[] = [
    {
      key: 'cat',
      width: 30,
      render: (it) => {
        const meta = STAT_META[it.stat as StatKey] ?? FALLBACK;
        return (
          <View style={[styles.iconBox, { backgroundColor: withAlpha(meta.color, 0.12) }]}>
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
      width: 42,
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
      <View style={styles.head}>
        <Text style={styles.h1}>Quest history</Text>
        <Text style={styles.headSub}>Every quest you&apos;ve finished — most recent first.</Text>
      </View>

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
  head: { gap: 4, marginBottom: 2 },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  headSub: { color: text.secondary, fontSize: 13 },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  iconBox: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  title: { color: text.primary, fontSize: 13, fontWeight: '600' },
  sub: { color: text.faint, fontSize: 11, marginTop: 1 },
  date: { color: text.secondary, fontSize: 12, fontWeight: '600' },
  xp: { fontSize: 13, fontWeight: '700' },
});
