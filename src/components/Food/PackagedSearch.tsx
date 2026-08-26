import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { SearchRow } from '@/components/SearchRow';
import { Field } from '@/components/ui/Field';
import { Text } from '@/components/ui/Text';
import { useSearch } from '@/hooks/useSearch';
import type { ApiFoodSearchItem, MealSlot } from '@/lib/api';
import { num } from '@/lib/num';
import { emptyDraft, type PlateDraft } from '@/lib/plate';
import { TAP_MIN, neutral, onAccent, radius, sage, space, surface, text, typography } from '@/theme';

const TONE = sage[600];

/**
 * The one kind of food that genuinely comes with numbers: a packaged one.
 *
 * Hands are the right unit for a plate nobody weighed, but a tub of yoghurt has
 * its grams printed on the side, and rounding that to "a palm" would be throwing
 * away a real measurement. What's found here keeps its own figures and feeds the
 * week's trend with a much tighter spread than a plate can.
 */
export function PackagedSearch({
  slot,
  search,
  onPick,
}: {
  slot: MealSlot;
  search: (q: string) => Promise<ApiFoodSearchItem[]>;
  onPick: (draft: PlateDraft) => void;
}) {
  const { query, setQuery, results, setResults, searching, note, run } = useSearch<ApiFoodSearchItem>(search, {
    empty: 'No matches — log it as a plate instead.',
    error: 'Lookup unavailable right now — log it as a plate instead.',
  });
  const [selected, setSelected] = useState<ApiFoodSearchItem | null>(null);
  const [grams, setGrams] = useState('100');

  const doSearch = () => {
    setSelected(null);
    void run();
  };

  const add = () => {
    if (!selected) return;
    const g = Math.max(0, Math.round(num(grams)));
    const factor = g > 0 ? g / 100 : 1;
    onPick({
      ...emptyDraft(slot),
      name: g > 0 ? `${selected.name} · ${g}g` : selected.name,
      grams: g,
      kcal: Math.round(selected.kcal_100g * factor),
      protein_g: Math.round(selected.protein_100g * factor),
      fibre_g: Math.round(selected.fibre_100g * factor),
      note: 'Read off the label, so these numbers are real.',
    });
    setSelected(null);
    setResults([]);
    setQuery('');
  };

  return (
    <View style={styles.wrap}>
      <SearchRow
        value={query}
        onChangeText={setQuery}
        onSubmit={doSearch}
        searching={searching}
        placeholder="Look up a packaged food"
        tone={TONE}
      />
      {note ? <Text style={styles.note}>{note}</Text> : null}
      {results.map((r, i) => {
        const on = selected === r;
        return (
          <View key={`${r.name}-${i}`}>
            <Pressable onPress={() => setSelected(on ? null : r)} style={styles.result}>
              <Text style={styles.resultName} numberOfLines={1}>
                {r.name}
                {r.brand ? <Text style={styles.resultBrand}> · {r.brand}</Text> : null}
              </Text>
              <Text style={styles.resultMeta}>
                per 100g: {r.kcal_100g} kcal · {r.protein_100g}g protein · {r.fibre_100g}g fibre
              </Text>
            </Pressable>
            {on ? (
              <View style={styles.gramsRow}>
                <Field
                  value={grams}
                  onChangeText={(v) => setGrams(v.replace(/[^0-9]/g, ''))}
                  style={styles.gramsInput}
                  keyboardType="number-pad"
                  placeholder="grams"
                  maxLength={4}
                />
                <Text style={styles.preview}>
                  ≈ {Math.round((r.kcal_100g * Math.max(0, num(grams))) / 100)} kcal
                </Text>
                <Pressable onPress={add} style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}>
                  <Text style={styles.addLabel}>Add</Text>
                </Pressable>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  note: { ...typography.small, color: text.secondary, paddingHorizontal: 4 },
  result: {
    gap: 2,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  resultName: { ...typography.cardTitle, color: neutral[900] },
  resultBrand: { color: text.faint },
  resultMeta: { ...typography.tiny, color: text.secondary },
  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 10 },
  gramsInput: { width: 92 },
  preview: { ...typography.small, color: text.secondary, flex: 1 },
  add: {
    backgroundColor: TONE,
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  addLabel: { ...typography.button, color: onAccent },
});
