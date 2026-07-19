import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import type { ApiHistoryItem } from '@/lib/api';
import { dateKey, groupByDay } from '@/lib/dates';
import { useHistory } from '@/query/useHistory';
import type { StatKey } from '@/types';
import { STAT_META, surface, text, withAlpha } from '@/theme';

const CADENCE_LABEL: Record<string, string> = { daily: 'Daily', weekly: 'Weekly', side: 'Side' };
const FALLBACK = { color: text.faint, icon: 'ellipse-outline' as const, label: 'Quest' };

/** "Today" / "Yesterday" / "Tue, Jul 15" from a 'YYYY-MM-DD' day, relative to
 * the device's today. */
function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  const d = new Date(`${day}T00:00:00`);
  const t = new Date(`${today}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  const diff = Math.round((t.getTime() - d.getTime()) / 86_400_000);
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function Row({ item }: { item: ApiHistoryItem }) {
  const meta = STAT_META[item.stat as StatKey] ?? FALLBACK;
  const cadence = CADENCE_LABEL[item.cadence] ?? '';
  return (
    <View style={styles.row}>
      <View style={[styles.iconBox, { backgroundColor: withAlpha(meta.color, 0.12) }]}>
        <Ionicons name={meta.icon} size={15} color={meta.color} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.title} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.meta}>{cadence ? `${meta.label} · ${cadence}` : meta.label}</Text>
      </View>
      <Text style={[styles.xp, { color: meta.color }]}>+{item.xp}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const { history, loading } = useHistory();
  const today = dateKey();
  const groups = groupByDay(history);

  return (
    <Screen>
      <BackLink />
      <View style={styles.head}>
        <Text style={styles.h1}>Quest history</Text>
        <Text style={styles.sub}>Every quest you&apos;ve finished — most recent first.</Text>
      </View>

      {groups.length === 0 ? (
        <SystemPanel>
          <Text style={styles.empty}>
            {loading ? 'Loading…' : 'No finished quests yet. Complete one and it lands here.'}
          </Text>
        </SystemPanel>
      ) : (
        groups.map((g) => {
          const dayXp = g.items.reduce((sum, it) => sum + it.xp, 0);
          return (
            <SystemPanel key={g.day} title={dayLabel(g.day, today)} sub={`+${dayXp} XP`}>
              <View style={styles.list}>
                {g.items.map((it) => (
                  <Row key={it.id} item={it} />
                ))}
              </View>
            </SystemPanel>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4, marginBottom: 2 },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  sub: { color: text.secondary, fontSize: 13 },
  empty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  list: { gap: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  iconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 1 },
  title: { color: text.primary, fontSize: 13, fontWeight: '600' },
  meta: { color: text.faint, fontSize: 11 },
  xp: { fontSize: 13, fontWeight: '700' },
});
