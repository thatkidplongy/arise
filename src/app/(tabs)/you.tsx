import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarEditor } from '@/components/AvatarEditor';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import type { ApiState, ApiWeekReview } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, STAT_META, surface, text } from '@/theme';

// The occasional screens live here rather than crowding the tab bar. Adding more
// later? Drop another row in — the bar stays at five.
const ITEMS = [
  { icon: 'book-outline', label: 'Journal', sub: 'Write freely · quest reflections', route: '/journal' },
  { icon: 'trophy-outline', label: 'Achievements', sub: 'Titles & milestones', route: '/achievements' },
  { icon: 'compass-outline', label: 'Focus areas', sub: 'Tailor your quests · interview mode', route: '/focus' },
  { icon: 'settings-outline', label: 'Settings', sub: 'North Star · system link · your record', route: '/settings' },
] as const;

/** A gentle recap of the current ISO week — what got done, not what was missed. */
function WeekReview({ review }: { review: ApiWeekReview }) {
  const top = review.top_stat ? STAT_META[review.top_stat] : null;
  const cells = [
    { n: review.completions, label: 'quests' },
    { n: review.xp, label: 'XP' },
    { n: review.active_days, label: 'days shown up' },
    { n: review.days_cleared, label: 'days cleared' },
  ];
  return (
    <SystemPanel title="This week" sub={review.completions ? `${review.completions} done` : undefined}>
      {review.completions === 0 ? (
        <Text style={styles.weekEmpty}>A fresh week — whatever you do from here counts.</Text>
      ) : (
        <>
          <View style={styles.weekRow}>
            {cells.map((c) => (
              <View key={c.label} style={styles.weekCell}>
                <Text style={styles.weekNum}>{c.n.toLocaleString()}</Text>
                <Text style={styles.weekLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
          {top ? (
            <Text style={styles.weekTop}>
              Leaning into <Text style={{ color: top.color, fontWeight: '700' }}>{top.label}</Text> most this week.
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
    <SystemPanel title="Completed" sub={`${todos.length + bought.length} done`}>
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

      {state ? <WeekReview review={state.week_review} /> : null}

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
  weekEmpty: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  weekRow: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 14, columnGap: 12 },
  weekCell: { width: '46%' },
  weekNum: { color: text.primary, fontSize: 22, fontWeight: '700' },
  weekLabel: { color: text.faint, fontSize: 11, marginTop: 1 },
  weekTop: { color: text.secondary, fontSize: 12, marginTop: 14, lineHeight: 17 },
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
