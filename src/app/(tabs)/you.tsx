import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AvatarEditor } from '@/components/AvatarEditor';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Kicker } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiState } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { STAT_META, clay, feedback, neutral, radius, sage, surface, text, typography } from '@/theme';

// The occasional screens live here rather than crowding the tab bar. Adding more
// later? Drop another row in — the bar stays at five.
const ITEMS = [
  { icon: 'nutrition-outline', label: 'Food', sub: 'Meals & macros · groceries', route: '/body' },
  { icon: 'book-outline', label: 'Journal', sub: 'Write freely · quest reflections', route: '/journal' },
  { icon: 'wallet-outline', label: 'Money', sub: 'Spending & income · weekly totals', route: '/money' },
  { icon: 'trophy-outline', label: 'Achievements', sub: 'Titles & milestones', route: '/achievements' },
  { icon: 'flame-outline', label: 'Boss fights', sub: 'Long milestones · never a penalty', route: '/bosses' },
  { icon: 'calendar-outline', label: 'Weekly recap', sub: 'How the week actually went', route: '/recap' },
  { icon: 'time-outline', label: 'Quest history', sub: 'Every quest you’ve finished', route: '/history' },
  { icon: 'compass-outline', label: 'Focus areas', sub: 'Tailor your quests · interview mode', route: '/focus' },
  { icon: 'sparkles-outline', label: 'Skincare', sub: 'Your AM / PM routine', route: '/skincare' },
  { icon: 'settings-outline', label: 'Settings', sub: 'North Star · system link · your record', route: '/settings' },
] as const;

/** The all-time record — everything you've done since the start, not just this
 * week. Momentum for the current week lives on Status (the streak). */
function Lifetime({ record }: { record: ApiState['record'] }) {
  const top = record.top_stat ? STAT_META[record.top_stat] : null;
  const cells = [
    { n: record.total_completions, label: 'quests', color: clay[700] },
    { n: record.xp, label: 'XP', color: clay[700] },
    { n: record.active_days, label: 'days shown up', color: sage[700] },
    { n: record.days_cleared, label: 'days cleared', color: sage[700] },
  ];
  return (
    <SystemPanel title="All time">
      {record.total_completions === 0 ? (
        <Text style={styles.statEmpty}>Your record starts with your first quest. Whenever you&apos;re ready.</Text>
      ) : (
        <>
          <View style={styles.statRow}>
            {cells.map((c) => (
              <View key={c.label} style={styles.statCell}>
                <Text style={[styles.statNum, { color: c.color }]}>{c.n.toLocaleString()}</Text>
                <Text style={styles.statLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
          {top ? (
            <Text style={styles.statTop}>
              Leaning into <Text style={[styles.statTopName, { color: top.color }]}>{top.label}</Text> most overall.
            </Text>
          ) : null}
        </>
      )}
    </SystemPanel>
  );
}

/** "Jul 18" from an ISO timestamp, or '' when there's none. */
function shortDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type DoneRow = { id: string; label: string; when: string };

/** One labelled group of finished items — each with when it was done, an undo (put
 * it back on its list) and a × (remove for good). */
function CompletedGroup({
  label,
  rows,
  onUndo,
  onDelete,
  spaced,
}: {
  label: string;
  rows: DoneRow[];
  onUndo: (id: string) => void;
  onDelete: (id: string) => void;
  spaced?: boolean;
}) {
  return (
    <View style={spaced ? styles.groupSpaced : undefined}>
      <Kicker>{label}</Kicker>
      {rows.map((r) => (
        <View key={r.id} style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={18} color={feedback.success} />
          <Text style={styles.doneLabel} numberOfLines={1}>
            {r.label}
          </Text>
          {r.when ? <Text style={styles.doneWhen}>{r.when}</Text> : null}
          <Pressable onPress={() => onUndo(r.id)} hitSlop={10} accessibilityLabel={`Undo ${r.label}`}>
            <Ionicons name="arrow-undo-outline" size={16} color={clay[700]} />
          </Pressable>
          <Pressable onPress={() => onDelete(r.id)} hitSlop={10} accessibilityLabel={`Delete ${r.label}`}>
            <Ionicons name="close" size={17} color={text.faint} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

/** The record of finished to-dos and bought groceries. They land here once ticked
 * off their lists; undo puts one back. Nothing shows until something's completed. */
function Completed({ reminders, grocery }: Pick<ApiState, 'reminders' | 'grocery'>) {
  const toggleReminder = useSystem((s) => s.toggleReminder);
  const removeReminder = useSystem((s) => s.removeReminder);
  const toggleGrocery = useSystem((s) => s.toggleGrocery);
  const removeGrocery = useSystem((s) => s.removeGrocery);

  const todos = reminders.filter((r) => r.done);
  const bought = grocery.filter((g) => g.bought);
  if (todos.length + bought.length === 0) return null;

  return (
    <SystemPanel title="Completed" sub={`${todos.length + bought.length} done`} collapsible defaultCollapsed>
      {todos.length ? (
        <CompletedGroup
          label="To-dos"
          rows={todos.map((r) => ({ id: r.id, label: r.text, when: shortDate(r.done_at) }))}
          onUndo={(id) => void toggleReminder(id, false)}
          onDelete={(id) => void removeReminder(id)}
        />
      ) : null}
      {bought.length ? (
        <CompletedGroup
          label="Groceries"
          rows={bought.map((g) => ({ id: g.id, label: g.name, when: shortDate(g.bought_at) }))}
          onUndo={(id) => void toggleGrocery(id, false)}
          onDelete={(id) => void removeGrocery(id)}
          spaced={todos.length > 0}
        />
      ) : null}
    </SystemPanel>
  );
}

export default function YouScreen() {
  const state = useSystem((s) => s.state);

  return (
    <Screen>
      <View style={styles.head}>
        <AvatarEditor />
        <Text style={styles.h1}>{state?.player.name ?? 'You'}</Text>
        {state ? (
          <Text style={styles.sub}>
            Level {state.player.level} · Rank {state.player.rank} · best streak {state.streak.best}
          </Text>
        ) : null}
      </View>

      {state ? <Lifetime record={state.record} /> : null}

      {state ? <Completed reminders={state.reminders} grocery={state.grocery} /> : null}

      {/* Two across — a hub reads faster as tiles than as a list of rows. */}
      <View style={styles.grid}>
        {ITEMS.map((it) => (
          <Pressable
            key={it.route}
            onPress={() => router.push(it.route)}
            style={({ pressed }) => [styles.tile, pressed && { backgroundColor: clay[100] }]}
          >
            <View style={styles.tileDisc}>
              <Ionicons name={it.icon} size={18} color={clay[800]} />
            </View>
            <Text style={styles.tileLabel}>{it.label}</Text>
            <Text style={styles.tileSub}>{it.sub}</Text>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 10, paddingTop: 16, paddingBottom: 4, alignItems: 'center' },
  h1: { ...typography.numeral, fontSize: 28, color: neutral[900], includeFontPadding: false },
  sub: { ...typography.small, fontSize: 12.5, color: text.secondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: {
    // Two columns with a 12px gutter, and a hair off so rounding never wraps a row.
    width: '48%',
    flexGrow: 1,
    minHeight: 122,
    gap: 10,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: surface.card,
  },
  tileDisc: {
    width: 40,
    height: 40,
    borderRadius: radius.pill,
    backgroundColor: clay[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileLabel: { ...typography.cardTitle, fontSize: 13.5, color: neutral[900] },
  tileSub: { ...typography.tiny, color: text.secondary, marginTop: -6 },
  statEmpty: { ...typography.body, color: text.secondary },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 18, columnGap: 12 },
  statCell: { width: '46%' },
  statNum: { ...typography.numeral, fontSize: 32, includeFontPadding: false },
  statLabel: { ...typography.small, color: text.secondary, marginTop: 4 },
  statTop: { ...typography.small, fontSize: 12.5, color: text.secondary, marginTop: 16 },
  statTopName: { fontWeight: '600' },
  groupSpaced: { marginTop: 18 },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 44,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  doneLabel: { ...typography.body, color: text.secondary, flex: 1 },
  doneWhen: { ...typography.small, color: text.faint },
});
