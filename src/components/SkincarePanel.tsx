import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SearchRow } from '@/components/SearchRow';
import { useSearch } from '@/hooks/useSearch';
import type { ApiSkincarePick, ApiSkincareProduct, ApiSkincareStep } from '@/lib/api';
import { COUNTRY_LABEL } from '@/lib/country';
import { useBody } from '@/query/useBody';
import { feedback, STAT_META, surface, text, withAlpha } from '@/theme';

import { SystemPanel } from './SystemPanel';

const TONE = STAT_META.CFT.color;

function Routine({
  title,
  icon,
  routine,
  steps,
}: {
  title: string;
  icon: 'sunny-outline' | 'moon-outline';
  routine: 'AM' | 'PM';
  steps: ApiSkincareStep[];
}) {
  const { toggleStep, addStep, removeStep } = useBody();
  const [draft, setDraft] = useState('');

  const add = async () => {
    const t = draft.trim();
    if (!t) return;
    setDraft('');
    await addStep(routine, t);
  };

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <View style={styles.routine}>
      <View style={styles.routineHead}>
        <Ionicons name={icon} size={15} color={TONE} />
        <Text style={styles.routineTitle}>{title}</Text>
        <Text style={styles.routineCount}>
          {doneCount}/{steps.length}
        </Text>
      </View>
      {steps.map((s) => (
        <View key={s.id} style={styles.step}>
          <Pressable onPress={() => toggleStep(s.id, !s.done)} style={styles.stepTap} hitSlop={4}>
            <Ionicons
              name={s.done ? 'checkmark-circle' : 'ellipse-outline'}
              size={20}
              color={s.done ? feedback.success : text.faint}
            />
            <Text style={[styles.stepText, s.done && styles.stepTextDone]}>{s.text}</Text>
          </Pressable>
          <Pressable onPress={() => removeStep(s.id)} hitSlop={8}>
            <Text style={styles.remove}>×</Text>
          </Pressable>
        </View>
      ))}
      <View style={styles.addRow}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={add}
          blurOnSubmit={false}
          returnKeyType="done"
          style={styles.addInput}
          placeholder={`Add a ${routine === 'AM' ? 'morning' : 'evening'} step`}
          placeholderTextColor={text.faint}
          maxLength={120}
        />
        <Pressable onPress={add} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.addBtnText, { color: TONE }]}>Add</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Concrete, easy-to-find products for each step, localised to what's on shelves
 * where you are — so you know what to actually buy. */
function ProductPicks({ picks, country }: { picks: ApiSkincarePick[]; country: string }) {
  if (picks.length === 0) return null;
  const where = COUNTRY_LABEL[country];
  const groups: { label: string; items: ApiSkincarePick[] }[] = [
    { label: 'MORNING', items: picks.filter((p) => p.slot === 'AM') },
    { label: 'EVENING', items: picks.filter((p) => p.slot === 'PM') },
  ];
  return (
    <View style={styles.buy}>
      <Text style={styles.lookupTitle}>What to buy{where ? ` · ${where}` : ''}</Text>
      <Text style={styles.lookupHint}>
        Popular, easy-to-find picks for each step — a starting point, not medical advice or an
        endorsement. Add one active at a time and patch-test.
      </Text>
      {groups.map(({ label, items }) =>
        items.length === 0 ? null : (
          <View key={label} style={styles.buyGroup}>
            <Text style={styles.buyGroupLabel}>{label}</Text>
            {items.map((p, i) => (
              <View key={`${p.step}-${i}`} style={styles.buyRow}>
                <Text style={styles.buyStep}>{p.step}</Text>
                <Text style={styles.buyProduct}>
                  <Text style={styles.buyBrand}>{p.brand}</Text> {p.product}
                </Text>
                <Text style={styles.buyWhy}>{p.why}</Text>
              </View>
            ))}
          </View>
        ),
      )}
    </View>
  );
}

/** Look a product up in Open Beauty Facts and read what's inside — which actives
 * help pigmentation & pores, and anything gentle to be aware of. */
function ProductLookup() {
  const { searchProducts } = useBody();
  const { query, setQuery, results, searching, note, run } = useSearch<ApiSkincareProduct>(searchProducts, {
    empty: 'No match with a readable ingredient list — try the brand and product name together.',
    error: 'Lookup unavailable right now — try again in a bit.',
  });
  const [openIdx, setOpenIdx] = useState<number | null>(null);

  const search = () => {
    setOpenIdx(null);
    void run();
  };

  return (
    <View style={styles.lookup}>
      <Text style={styles.lookupTitle}>Check a product</Text>
      <Text style={styles.lookupHint}>
        Search any product to read its ingredients and see which actives suit pigmentation & pores.
      </Text>
      <SearchRow
        value={query}
        onChangeText={setQuery}
        onSubmit={search}
        searching={searching}
        placeholder="e.g. CeraVe moisturising lotion"
        tone={TONE}
        maxLength={80}
      />
      {note ? <Text style={styles.lookupNote}>{note}</Text> : null}

      {results.map((p, i) => {
        const open = openIdx === i;
        return (
          <View key={`${p.name}-${i}`} style={styles.product}>
            <Text style={styles.productName} numberOfLines={2}>
              {p.name}
              {p.brand ? <Text style={styles.productBrand}> · {p.brand}</Text> : null}
            </Text>

            {p.helpful.length > 0 ? (
              <View style={styles.chips}>
                {p.helpful.map((h) => (
                  <View key={h.label} style={[styles.chip, styles.chipGood]}>
                    <Text style={styles.chipGoodText}>{h.label}</Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.noneText}>No standout actives for pigmentation or pores here.</Text>
            )}

            {p.watch.length > 0 ? (
              <View style={styles.chips}>
                {p.watch.map((w) => (
                  <View key={w.label} style={[styles.chip, styles.chipWatch]}>
                    <Text style={styles.chipWatchText}>{w.label}</Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Pressable onPress={() => setOpenIdx(open ? null : i)} hitSlop={6}>
              <Text style={styles.detailToggle}>{open ? 'Hide details' : 'What each does · full ingredients'}</Text>
            </Pressable>

            {open ? (
              <View style={styles.details}>
                {[...p.helpful, ...p.watch].map((n) => (
                  <Text key={n.label} style={styles.detailLine}>
                    <Text style={styles.detailLabel}>{n.label}</Text> — {n.detail}
                  </Text>
                ))}
                <Text style={styles.ingredients}>{p.ingredients}</Text>
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

export function SkincarePanel() {
  const { body } = useBody();
  if (!body) return null;

  return (
    <SystemPanel title="Skincare" sub="pigmentation & pores">
      {body.skincare_streak > 0 || body.skincare_days > 0 ? (
        <View style={styles.streakRow}>
          <Ionicons name="flame" size={14} color={feedback.gold} />
          <Text style={styles.streakText}>
            {body.skincare_streak > 0
              ? `${body.skincare_streak}-day streak`
              : `${body.skincare_days} ${body.skincare_days === 1 ? 'day' : 'days'} done`}
            <Text style={styles.streakSub}> · a done routine builds Spirit</Text>
          </Text>
        </View>
      ) : (
        <Text style={styles.streakHint}>Finish a morning or evening routine and it builds Spirit — small and consistent.</Text>
      )}
      <Text style={styles.note}>{body.skincare_note}</Text>
      <Routine title="Morning" icon="sunny-outline" routine="AM" steps={body.skincare_am} />
      <Routine title="Evening" icon="moon-outline" routine="PM" steps={body.skincare_pm} />
      <ProductPicks picks={body.skincare_products} country={body.profile?.country ?? ''} />
      <ProductLookup />
      {body.skincare_resources.length > 0 ? (
        <View style={styles.resources}>
          <Text style={styles.resourcesLabel}>LEARN</Text>
          {body.skincare_resources.map((r) => (
            <Text key={r} style={styles.resource}>
              {r}
            </Text>
          ))}
        </View>
      ) : null}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  streakRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  streakText: { color: text.primary, fontSize: 13, fontWeight: '700' },
  streakSub: { color: text.faint, fontSize: 12, fontWeight: '400' },
  streakHint: { color: text.faint, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  note: {
    color: text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 14,
    backgroundColor: withAlpha(TONE, 0.07),
    borderRadius: 9,
    padding: 11,
  },
  routine: { marginBottom: 16 },
  routineHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  routineTitle: { color: text.primary, fontSize: 13, fontWeight: '700' },
  routineCount: { color: text.faint, fontSize: 12, marginLeft: 'auto' },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  stepTap: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  stepText: { color: text.primary, fontSize: 13, flex: 1, lineHeight: 18 },
  stepTextDone: { color: text.faint, textDecorationLine: 'line-through' },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -2 },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    backgroundColor: surface.base,
  },
  addBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 14,
  },
  addBtnText: { fontSize: 13, fontWeight: '700' },

  // What to buy
  buy: {
    marginTop: 4,
    marginBottom: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  buyGroup: { marginTop: 10 },
  buyGroupLabel: { color: TONE, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  buyRow: { paddingVertical: 6, borderTopWidth: 1, borderTopColor: surface.hairline },
  buyStep: { color: text.faint, fontSize: 10, fontWeight: '700', letterSpacing: 0.4, textTransform: 'uppercase' },
  buyProduct: { color: text.primary, fontSize: 13, lineHeight: 18, marginTop: 1 },
  buyBrand: { fontWeight: '700' },
  buyWhy: { color: text.secondary, fontSize: 11, lineHeight: 15, marginTop: 1 },

  // Product lookup
  lookup: {
    marginTop: 4,
    marginBottom: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  lookupTitle: { color: text.primary, fontSize: 14, fontWeight: '700' },
  lookupHint: { color: text.faint, fontSize: 11, lineHeight: 16, marginTop: 2, marginBottom: 10 },
  lookupNote: { color: text.secondary, fontSize: 12, marginTop: 10 },
  product: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  productName: { color: text.primary, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  productBrand: { color: text.faint, fontWeight: '400' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  chip: { borderRadius: 99, paddingVertical: 4, paddingHorizontal: 10 },
  chipGood: { backgroundColor: withAlpha(feedback.success, 0.14) },
  chipGoodText: { color: feedback.success, fontSize: 11, fontWeight: '700' },
  chipWatch: { backgroundColor: withAlpha(feedback.gold, 0.16) },
  chipWatchText: { color: feedback.gold, fontSize: 11, fontWeight: '700' },
  noneText: { color: text.faint, fontSize: 12, marginTop: 8, fontStyle: 'italic' },
  detailToggle: { color: TONE, fontSize: 12, fontWeight: '700', marginTop: 10 },
  details: { marginTop: 8, gap: 6 },
  detailLine: { color: text.secondary, fontSize: 12, lineHeight: 17 },
  detailLabel: { color: text.primary, fontWeight: '700' },
  ingredients: {
    color: text.faint,
    fontSize: 11,
    lineHeight: 16,
    marginTop: 4,
    backgroundColor: surface.base,
    borderRadius: 8,
    padding: 9,
  },

  resources: { marginTop: 4, gap: 5 },
  resourcesLabel: { color: text.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  resource: { color: text.secondary, fontSize: 12, lineHeight: 18 },
});
