import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/ui/Text';
import type { ApiPriority } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import type { StatKey } from '@/types';
import { STAT_KEYS, STAT_META, TAP_MIN, accent, onAccent, radius, surface, text, typography, withAlpha } from '@/theme';

type Scope = 'day' | 'week' | 'open';
const SCOPES: { key: Scope; label: string }[] = [
  { key: 'day', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'open', label: 'Ongoing' },
];
const SCOPE_LABEL: Record<string, string> = { day: 'Today', week: 'This week', open: 'Ongoing' };

/** One pinned priority, coloured by its attribute — it sits on top of that
 * category's plan without changing anything below. */
function PriorityItem({ p, onEdit, onClear }: { p: ApiPriority; onEdit: () => void; onClear: () => void }) {
  const meta = STAT_META[p.stat];
  return (
    <View style={[styles.card, { borderColor: withAlpha(meta.color, 0.55), backgroundColor: withAlpha(meta.color, 0.06) }]}>
      <View style={styles.head}>
        <View style={[styles.badge, { backgroundColor: meta.color }]}>
          <Ionicons name={meta.icon} size={11} color={onAccent} />
          <Text style={styles.badgeText}>PRIORITY · {meta.label.toUpperCase()}</Text>
        </View>
        <Text style={[styles.scopeTag, { color: meta.color }]}>{SCOPE_LABEL[p.scope] ?? ''}</Text>
      </View>
      <Text style={styles.title}>{p.title}</Text>
      {p.note ? <Text style={styles.note}>{p.note}</Text> : null}
      <View style={styles.steps}>
        {p.steps.map((s, i) => (
          <View key={i} style={styles.stepRow}>
            <View style={[styles.dot, { backgroundColor: meta.color }]} />
            <Text style={styles.stepText}>{s}</Text>
          </View>
        ))}
      </View>
      <View style={styles.actions}>
        <Pressable onPress={onEdit} hitSlop={6}>
          <Text style={[styles.linkText, { color: meta.color }]}>Change</Text>
        </Pressable>
        <Pressable onPress={onClear} hitSlop={6}>
          <Text style={styles.linkMuted}>Clear</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Per-attribute priorities pinned to the top of the Quest board. Pick a category
 * (Physical, Creativity…), a focus (e.g. "abs"), and a scope — it stacks a
 * handcrafted focus on top of that category without removing anything. One per
 * attribute; set the same one again to replace it. All content is free (no LLM).
 */
export function PriorityBoard({ priorities }: { priorities: ApiPriority[] }) {
  const setPriority = useSystem((s) => s.setPriority);
  const clearPriority = useSystem((s) => s.clearPriority);

  const [editing, setEditing] = useState(false);
  const [stat, setStat] = useState<StatKey>('STR');
  const [focus, setFocus] = useState('');
  const [scope, setScope] = useState<Scope>('week');

  const openNew = () => {
    setStat('STR');
    setFocus('');
    setScope('week');
    setEditing(true);
  };
  const openEdit = (p: ApiPriority) => {
    setStat(p.stat);
    setFocus(p.focus);
    setScope(p.scope);
    setEditing(true);
  };
  const save = () => {
    const f = focus.trim();
    if (!f) return;
    void setPriority(stat, f, scope);
    setEditing(false);
  };

  return (
    <View style={styles.wrap}>
      {priorities.map((p) => (
        <PriorityItem key={p.stat} p={p} onEdit={() => openEdit(p)} onClear={() => void clearPriority(p.stat)} />
      ))}

      {editing ? (
        <View style={[styles.card, styles.editing]}>
          <Text style={styles.title}>Prioritise a category</Text>
          <Text style={styles.note}>Stacks on top of that category — nothing below is removed.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stats}>
            {STAT_KEYS.map((k) => {
              const meta = STAT_META[k];
              const on = stat === k;
              return (
                <Pressable
                  key={k}
                  onPress={() => setStat(k)}
                  style={[styles.statChip, on && { borderColor: meta.color, backgroundColor: withAlpha(meta.color, 0.14) }]}
                >
                  <Ionicons name={meta.icon} size={13} color={on ? meta.color : text.faint} />
                  <Text style={[styles.statText, on && { color: meta.color }]}>{meta.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <TextInput
            value={focus}
            onChangeText={setFocus}
            placeholder="Focus — e.g. abs, passive income"
            placeholderTextColor={text.faint}
            style={styles.input}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={save}
          />
          <View style={styles.scopeRow}>
            {SCOPES.map((s) => {
              const on = scope === s.key;
              return (
                <Pressable key={s.key} onPress={() => setScope(s.key)} style={[styles.chip, on && styles.chipOn]}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.actions}>
            <Pressable onPress={save} style={({ pressed }) => [styles.save, pressed && { opacity: 0.85 }]}>
              <Text style={styles.saveText}>Pin it</Text>
            </Pressable>
            <Pressable onPress={() => setEditing(false)} hitSlop={6}>
              <Text style={styles.linkMuted}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <Pressable onPress={openNew} style={({ pressed }) => [styles.setBtn, pressed && { opacity: 0.7 }]}>
          <Ionicons name="flag-outline" size={15} color={accent} />
          <Text style={styles.setText}>{priorities.length ? 'Add another priority' : 'Set a priority'}</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  setBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderWidth: 1,
    borderColor: withAlpha(accent, 0.4),
    borderStyle: 'dashed',
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    paddingVertical: 11,
  },
  setText: { color: accent, fontSize: 13, fontWeight: '600' },
  card: {
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.md,
    padding: 16,
    gap: 6,
  },
  editing: { borderColor: withAlpha(accent, 0.55), backgroundColor: withAlpha(accent, 0.05) },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { color: onAccent, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  scopeTag: { fontSize: 12, fontWeight: '700' },
  title: { ...typography.heading, color: text.primary },
  note: { color: text.secondary, fontSize: 13, lineHeight: 18 },
  steps: { gap: 6, marginTop: 4 },
  stepRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  dot: { width: 4, height: 4, borderRadius: 2, marginTop: 7, marginLeft: 4 },
  stepText: { flex: 1, color: text.secondary, fontSize: 13, lineHeight: 18 },
  stats: { gap: 7, paddingVertical: 2, paddingRight: 4 },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  statText: { color: text.faint, fontSize: 12, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 9,
    color: text.primary,
    fontSize: 14,
    backgroundColor: surface.card,
    marginTop: 2,
  },
  scopeRow: { flexDirection: 'row', gap: 7, marginTop: 2 },
  chip: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: surface.hairline, borderRadius: radius.pill, paddingVertical: 7 },
  chipOn: { borderColor: accent, backgroundColor: withAlpha(accent, 0.12) },
  chipText: { color: text.faint, fontSize: 12, fontWeight: '600' },
  chipTextOn: { color: accent },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  save: { backgroundColor: accent, borderRadius: radius.pill,
    minHeight: TAP_MIN,
    justifyContent: 'center', paddingVertical: 9, paddingHorizontal: 18 },
  saveText: { color: onAccent, fontSize: 13, fontWeight: '700' },
  linkText: { fontSize: 13, fontWeight: '600' },
  linkMuted: { color: text.faint, fontSize: 13, fontWeight: '600' },
});
