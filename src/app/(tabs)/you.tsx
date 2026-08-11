import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarEditor } from '@/components/AvatarEditor';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import type { ApiState } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, STAT_META, surface, text } from '@/theme';

// The occasional screens live here rather than crowding the tab bar. Adding more
// later? Drop another row in — the bar stays at five.
const ITEMS = [
  { icon: 'bulb-outline', label: 'Learn', sub: 'What you read · tomorrow’s recall', route: '/learn' },
  { icon: 'book-outline', label: 'Journal', sub: 'Write freely · quest reflections', route: '/journal' },
  { icon: 'wallet-outline', label: 'Money', sub: 'Spending & income · weekly totals', route: '/money' },
  { icon: 'trophy-outline', label: 'Achievements', sub: 'Titles & milestones', route: '/achievements' },
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
    { n: record.total_completions, label: 'quests' },
    { n: record.xp, label: 'XP' },
    { n: record.active_days, label: 'days shown up' },
    { n: record.days_cleared, label: 'days cleared' },
  ];
  return (
    <SystemPanel title="All time" sub={record.total_completions ? `${record.total_completions} done` : undefined}>
      {record.total_completions === 0 ? (
        <Text style={styles.statEmpty}>Your record starts with your first quest. Whenever you&apos;re ready.</Text>
      ) : (
        <>
          <View style={styles.statRow}>
            {cells.map((c) => (
              <View key={c.label} style={styles.statCell}>
                <Text style={styles.statNum}>{c.n.toLocaleString()}</Text>
                <Text style={styles.statLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
          {top ? (
            <Text style={styles.statTop}>
              Leaning into <Text style={{ color: top.color, fontWeight: '700' }}>{top.label}</Text> most overall.
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
      <Text style={styles.groupLabel}>{label}</Text>
      {rows.map((r) => (
        <View key={r.id} style={styles.doneRow}>
          <Ionicons name="checkmark-circle" size={17} color={feedback.success} />
          <Text style={styles.doneLabel} numberOfLines={1}>
            {r.label}
          </Text>
          {r.when ? <Text style={styles.doneWhen}>{r.when}</Text> : null}
          <Pressable onPress={() => onUndo(r.id)} hitSlop={8} accessibilityLabel={`Undo ${r.label}`}>
            <Ionicons name="arrow-undo-outline" size={16} color={accent} />
          </Pressable>
          <Pressable onPress={() => onDelete(r.id)} hitSlop={8} accessibilityLabel={`Delete ${r.label}`}>
            <Text style={styles.remove}>×</Text>
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
          label="TO-DOS"
          rows={todos.map((r) => ({ id: r.id, label: r.text, when: shortDate(r.done_at) }))}
          onUndo={(id) => void toggleReminder(id, false)}
          onDelete={(id) => void removeReminder(id)}
        />
      ) : null}
      {bought.length ? (
        <CompletedGroup
          label="GROCERIES"
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
        <Text style={styles.h1}>You</Text>
        {state ? (
          <Text style={styles.sub}>
            {state.player.name} · Level {state.player.level} · Rank {state.player.rank}
          </Text>
        ) : null}
      </View>

      {state ? <Lifetime record={state.record} /> : null}

      {state ? <Completed reminders={state.reminders} grocery={state.grocery} /> : null}

      <SystemPanel>
        {ITEMS.map((it, i) => (
          <Pressable
            key={it.route}
            onPress={() => router.push(it.route)}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { opacity: 0.65 }]}
          >
            <Ionicons name={it.icon} size={20} color={accent} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{it.label}</Text>
              <Text style={styles.rowSub}>{it.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={text.faint} />
          </Pressable>
        ))}
      </SystemPanel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4, marginBottom: 2, alignItems: 'center' },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  sub: { color: text.secondary, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: surface.hairline },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { color: text.primary, fontSize: 15, fontWeight: '600' },
  rowSub: { color: text.secondary, fontSize: 12 },
  statEmpty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  statRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 12 },
  statCell: { width: '46%' },
  statNum: { color: text.primary, fontSize: 22, fontWeight: '700' },
  statLabel: { color: text.faint, fontSize: 11, marginTop: 1 },
  statTop: { color: text.secondary, fontSize: 12, marginTop: 14, lineHeight: 17 },
  groupSpaced: { marginTop: 16 },
  groupLabel: { color: text.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  doneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  doneLabel: { color: text.secondary, fontSize: 13, lineHeight: 18, flex: 1 },
  doneWhen: { color: text.faint, fontSize: 11 },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -2 },
});
