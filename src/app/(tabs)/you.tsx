import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarEditor } from '@/components/AvatarEditor';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import type { ApiWeekReview } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { accent, STAT_META, surface, text } from '@/theme';

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

/** A quiet record of the grocery list — what's still to buy, and how much you've
 * ticked off. Editing lives on the Body tab; here it's compact chips that wrap, so
 * it stays short and uses the width. Capped, with a "+N more" when the list is long. */
const GROCERY_CAP = 12;

function GroceryRecord({ items }: { items: { id: string; name: string; bought: boolean }[] }) {
  const toBuy = items.filter((g) => !g.bought);
  const bought = items.length - toBuy.length;
  const shown = toBuy.slice(0, GROCERY_CAP);
  const overflow = toBuy.length - shown.length;
  return (
    <SystemPanel title="Groceries" sub={`${toBuy.length} to buy`}>
      {toBuy.length ? (
        <View style={styles.groceryWrap}>
          {shown.map((g) => (
            <View key={g.id} style={styles.groceryChip}>
              <Text style={styles.groceryChipText}>{g.name}</Text>
            </View>
          ))}
          {overflow > 0 ? (
            <Pressable onPress={() => router.push('/body')} style={styles.groceryMoreChip}>
              <Text style={styles.groceryMoreText}>+{overflow} more</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <Text style={styles.groceryDone}>All bought — nothing left on the list.</Text>
      )}
      {bought ? <Text style={styles.groceryMeta}>{bought} already bought</Text> : null}
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

      {state && state.grocery.length ? <GroceryRecord items={state.grocery} /> : null}

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
  groceryWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  groceryChip: {
    backgroundColor: surface.raised,
    borderRadius: 99,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  groceryChipText: { color: text.primary, fontSize: 13, fontWeight: '600' },
  groceryMoreChip: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 99,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  groceryMoreText: { color: accent, fontSize: 13, fontWeight: '700' },
  groceryDone: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  groceryMeta: { color: text.faint, fontSize: 12, marginTop: 8 },
});
