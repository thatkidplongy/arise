import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiFoodEstimate, ApiFoodSearchItem, ApiSuggestion } from '@/lib/api';
import { COUNTRY_LABEL } from '@/lib/country';
import { toBoundedDataUri, splitDataUri } from '@/lib/image';
import { num } from '@/lib/num';
import { useBody } from '@/query/useBody';
import { accent, feedback, onAccent, STAT_META, surface, text, withAlpha } from '@/theme';

import { NutritionProfileForm } from './NutritionProfileForm';
import { SystemPanel } from './SystemPanel';
import { XpBar } from './XpBar';

const TONE = STAT_META.CFT.color; // a calm tone for the Body tab
const GROUPS: { tag: ApiSuggestion['tag']; label: string }[] = [
  { tag: 'meal', label: 'Balanced meals' },
  { tag: 'protein', label: 'Protein-rich' },
  { tag: 'fibre', label: 'Fibre-rich' },
];


export function NutritionPanel() {
  const { body, search, analyzePhoto, logFood, removeFood } = useBody();

  const profile = body?.profile ?? null;
  const targets = body?.targets ?? null;
  const food = body?.food;
  const suggestions = body?.suggestions ?? [];

  const [editing, setEditing] = useState(false);
  const showForm = editing || !profile;

  // Food logging.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ApiFoodSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchNote, setSearchNote] = useState('');
  const [selected, setSelected] = useState<ApiFoodSearchItem | null>(null);
  const [grams, setGrams] = useState('100');
  const [manual, setManual] = useState(false);
  const [mName, setMName] = useState('');
  const [mKcal, setMKcal] = useState('');
  const [mProtein, setMProtein] = useState('');
  const [mFibre, setMFibre] = useState('');

  // Photo estimate.
  const [analyzing, setAnalyzing] = useState(false);
  const [photoError, setPhotoError] = useState('');
  const [estimate, setEstimate] = useState<ApiFoodEstimate | null>(null);
  const [eName, setEName] = useState('');
  const [eKcal, setEKcal] = useState('');
  const [eProtein, setEProtein] = useState('');
  const [eFibre, setEFibre] = useState('');

  const openEdit = () => setEditing(true);

  const runSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchNote('');
    setSelected(null);
    try {
      const items = await search(q);
      setResults(items);
      if (items.length === 0) setSearchNote('No matches — try another term or log it by hand.');
    } catch {
      setSearchNote('Lookup unavailable right now — you can still log it by hand.');
      setResults([]);
    }
    setSearching(false);
  };

  const addSelected = async () => {
    if (!selected) return;
    const g = Math.max(0, Math.round(num(grams)));
    const factor = g > 0 ? g / 100 : 1;
    await logFood({
      name: g > 0 ? `${selected.name} · ${g}g` : selected.name,
      grams: g,
      kcal: Math.round(selected.kcal_100g * factor),
      protein_g: Math.round(selected.protein_100g * factor),
      fibre_g: Math.round(selected.fibre_100g * factor),
    });
    setSelected(null);
    setResults([]);
    setQuery('');
  };

  const addManual = async () => {
    const name = mName.trim();
    if (!name) return;
    await logFood({
      name,
      grams: 0,
      kcal: Math.round(num(mKcal)),
      protein_g: Math.round(num(mProtein)),
      fibre_g: Math.round(num(mFibre)),
    });
    setMName('');
    setMKcal('');
    setMProtein('');
    setMFibre('');
    setManual(false);
  };

  const logSuggestion = (s: ApiSuggestion) =>
    logFood({ name: s.name, grams: 0, kcal: s.kcal, protein_g: s.protein_g, fibre_g: s.fibre_g });

  const pickAndAnalyze = async () => {
    setPhotoError('');
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.4,
      base64: true,
      allowsEditing: true,
    });
    if (res.canceled || !res.assets?.[0]) return;
    // Downscale (bounded but still legible for label reading) — on web the picker
    // returns the full-res photo, which would otherwise fail to upload.
    const dataUri = await toBoundedDataUri(res.assets[0], 1024, 0.7);
    if (!dataUri) {
      setPhotoError('Could not read that image — try another, or log by hand.');
      return;
    }
    const { base64, mime } = splitDataUri(dataUri);
    setAnalyzing(true);
    try {
      const est = await analyzePhoto(base64, mime);
      setEstimate(est);
      setEName(est.name);
      setEKcal(String(est.kcal));
      setEProtein(String(est.protein_g));
      setEFibre(String(est.fibre_g));
    } catch {
      setPhotoError('Couldn’t read that photo — try another shot, or log it by hand.');
    }
    setAnalyzing(false);
  };

  const addEstimate = async () => {
    await logFood({
      name: eName.trim() || 'Meal',
      grams: 0,
      kcal: Math.round(num(eKcal)),
      protein_g: Math.round(num(eProtein)),
      fibre_g: Math.round(num(eFibre)),
    });
    setEstimate(null);
  };

  // ── Profile form ──────────────────────────────────────────────────────────
  if (showForm) {
    return (
      <SystemPanel title="Nourishment" sub="Set your gentle targets">
        <NutritionProfileForm profile={profile} onDone={() => setEditing(false)} />
      </SystemPanel>
    );
  }

  // ── Summary + log + suggestions ─────────────────────────────────────────────
  const total = food?.total_kcal ?? 0;
  const within = targets && total >= targets.target_low && total <= targets.target_high;
  const over = targets && total > targets.target_high;
  const barColor = within ? feedback.success : over ? feedback.gold : TONE;

  return (
    <SystemPanel title="Nourishment" sub={`${food?.entries.length ?? 0} logged today`}>
      {targets ? (
        <>
          <View style={styles.targetRow}>
            <Text style={styles.bigNum}>{total.toLocaleString()}</Text>
            <Text style={styles.targetMeta}>
              of {targets.target_low.toLocaleString()}–{targets.target_high.toLocaleString()} kcal
            </Text>
          </View>
          <XpBar value={total} max={targets.target_high} color={barColor} height={8} />

          {/* protein + fibre progress */}
          <View style={styles.macros}>
            <View style={styles.macro}>
              <Text style={styles.macroLabel}>
                Protein <Text style={styles.macroVal}>{food?.total_protein ?? 0} / {targets.protein_g} g</Text>
              </Text>
              <XpBar value={food?.total_protein ?? 0} max={targets.protein_g} color={TONE} height={5} />
            </View>
            <View style={styles.macro}>
              <Text style={styles.macroLabel}>
                Fibre <Text style={styles.macroVal}>{food?.total_fibre ?? 0} / {targets.fibre_g} g</Text>
              </Text>
              <XpBar value={food?.total_fibre ?? 0} max={targets.fibre_g} color={feedback.success} height={5} />
            </View>
          </View>

          {/* BMI + goal weight */}
          <View style={styles.subRow}>
            <Text style={styles.subMeta}>
              BMI {targets.bmi} · {targets.bmi_category} · healthy {targets.healthy_low}–{targets.healthy_high} kg
              {targets.goal_weight ? ` · goal ${targets.goal_weight} kg` : ''}
            </Text>
            <Pressable onPress={openEdit}>
              <Text style={styles.editLink}>Edit</Text>
            </Pressable>
          </View>
          {over ? <Text style={styles.gentle}>A little over today — that’s completely fine.</Text> : null}
        </>
      ) : null}

      {/* Today's entries */}
      {food && food.entries.length > 0 ? (
        <View style={styles.entries}>
          {food.entries.map((e) => (
            <View key={e.id} style={styles.entry}>
              <View style={styles.entryMain}>
                <Text style={styles.entryName} numberOfLines={1}>
                  {e.name}
                </Text>
                <Text style={styles.entryMeta}>
                  {e.kcal} kcal · {e.protein_g}g protein · {e.fibre_g}g fibre
                </Text>
              </View>
              <Pressable onPress={() => removeFood(e.id)} hitSlop={8}>
                <Text style={styles.remove}>×</Text>
              </Pressable>
            </View>
          ))}
        </View>
      ) : null}

      {/* What to eat */}
      {suggestions.length > 0 ? (
        <View style={styles.suggest}>
          <Text style={styles.suggestTitle}>What to eat today</Text>
          <Text style={styles.suggestHint}>
            Protein- & fibre-forward picks{profile?.country && COUNTRY_LABEL[profile.country]
              ? ` for ${COUNTRY_LABEL[profile.country]}`
              : ''}. Tap + to log one.
          </Text>
          {GROUPS.map(({ tag, label }) => {
            const items = suggestions.filter((s) => s.tag === tag);
            if (items.length === 0) return null;
            return (
              <View key={tag} style={styles.group}>
                <Text style={styles.groupLabel}>{label}</Text>
                {items.map((s, i) => (
                  <View key={`${s.name}-${i}`} style={styles.sugRow}>
                    <View style={styles.sugMain}>
                      <Text style={styles.sugName} numberOfLines={1}>
                        {s.name}
                      </Text>
                      <Text style={styles.sugMeta}>
                        {s.kcal} kcal · {s.protein_g}g protein · {s.fibre_g}g fibre
                      </Text>
                    </View>
                    <Pressable onPress={() => logSuggestion(s)} hitSlop={6} style={styles.plus}>
                      <Text style={styles.plusText}>+</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Photo estimate */}
      <View style={styles.photoBox}>
        {estimate ? (
          <View style={styles.estimate}>
            <Text style={styles.estimateTitle}>
              {estimate.source === 'label' ? 'Read from the label — check it looks right' : 'Photo estimate — adjust anything that looks off'}
            </Text>
            <TextInput
              value={eName}
              onChangeText={setEName}
              style={styles.input}
              placeholder="What is it?"
              placeholderTextColor={text.faint}
              maxLength={80}
            />
            <View style={styles.searchRow}>
              <TextInput
                value={eKcal}
                onChangeText={(v) => setEKcal(v.replace(/[^0-9]/g, ''))}
                style={[styles.input, styles.searchInput]}
                keyboardType="number-pad"
                placeholder="kcal"
                placeholderTextColor={text.faint}
                maxLength={5}
              />
              <TextInput
                value={eProtein}
                onChangeText={(v) => setEProtein(v.replace(/[^0-9]/g, ''))}
                style={[styles.input, styles.searchInput]}
                keyboardType="number-pad"
                placeholder="protein g"
                placeholderTextColor={text.faint}
                maxLength={3}
              />
              <TextInput
                value={eFibre}
                onChangeText={(v) => setEFibre(v.replace(/[^0-9]/g, ''))}
                style={[styles.input, styles.searchInput]}
                keyboardType="number-pad"
                placeholder="fibre g"
                placeholderTextColor={text.faint}
                maxLength={3}
              />
            </View>
            {estimate.note ? (
              <Text style={styles.estimateNote}>
                {estimate.source === 'label' ? '' : 'Assumed: '}{estimate.note}
              </Text>
            ) : null}
            <Text style={styles.estimateNote}>
              {estimate.source === 'label'
                ? 'These are per serving — adjust if you ate more or less.'
                : 'Photo estimates are rough — tweak anything before saving.'}
            </Text>
            <View style={styles.searchRow}>
              <Pressable onPress={addEstimate} style={({ pressed }) => [styles.btn, styles.flex1, pressed && { opacity: 0.8 }]}>
                <Text style={styles.btnText}>Add to log</Text>
              </Pressable>
              <Pressable onPress={() => setEstimate(null)} style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.7 }]}>
                <Text style={[styles.searchBtnText, { color: text.secondary }]}>Discard</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <>
            <Pressable
              onPress={pickAndAnalyze}
              disabled={analyzing}
              style={({ pressed }) => [styles.photoBtn, (pressed || analyzing) && { opacity: 0.85 }]}
            >
              {analyzing ? (
                <ActivityIndicator size="small" color={TONE} />
              ) : (
                <Ionicons name="camera-outline" size={18} color={TONE} />
              )}
              <Text style={styles.photoBtnText}>
                {analyzing ? 'Reading your photo…' : 'Estimate from a photo'}
              </Text>
            </Pressable>
            {photoError ? <Text style={styles.searchNote}>{photoError}</Text> : null}
          </>
        )}
      </View>

      {/* Add a food */}
      <View style={styles.addBox}>
        {!manual ? (
          <>
            <View style={styles.searchRow}>
              <TextInput
                value={query}
                onChangeText={setQuery}
                onSubmitEditing={runSearch}
                returnKeyType="search"
                style={[styles.input, styles.searchInput]}
                placeholder="Search a food (e.g. banana, oats)"
                placeholderTextColor={text.faint}
              />
              <Pressable onPress={runSearch} style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.7 }]}>
                {searching ? <ActivityIndicator size="small" color={TONE} /> : <Text style={[styles.searchBtnText, { color: TONE }]}>Search</Text>}
              </Pressable>
            </View>
            {searchNote ? <Text style={styles.searchNote}>{searchNote}</Text> : null}
            {results.map((r, i) => {
              const on = selected === r;
              return (
                <View key={`${r.name}-${i}`}>
                  <Pressable onPress={() => setSelected(on ? null : r)} style={styles.result}>
                    <Text style={styles.resultName} numberOfLines={1}>
                      {r.name}
                      {r.brand ? <Text style={styles.resultBrand}> · {r.brand}</Text> : null}
                    </Text>
                    <Text style={styles.resultKcal}>
                      per 100g: {r.kcal_100g} kcal · {r.protein_100g}g protein · {r.fibre_100g}g fibre
                    </Text>
                  </Pressable>
                  {on ? (
                    <View style={styles.gramsRow}>
                      <TextInput
                        value={grams}
                        onChangeText={(v) => setGrams(v.replace(/[^0-9]/g, ''))}
                        style={[styles.input, styles.gramsInput]}
                        keyboardType="number-pad"
                        placeholder="grams"
                        placeholderTextColor={text.faint}
                        maxLength={4}
                      />
                      <Text style={styles.gramsPreview}>
                        ≈ {Math.round((r.kcal_100g * Math.max(0, num(grams))) / 100)} kcal
                      </Text>
                      <Pressable onPress={addSelected} style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}>
                        <Text style={styles.addBtnText}>Add</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              );
            })}
            <Pressable onPress={() => setManual(true)}>
              <Text style={styles.manualLink}>or log it by hand</Text>
            </Pressable>
          </>
        ) : (
          <>
            <TextInput
              value={mName}
              onChangeText={setMName}
              style={styles.input}
              placeholder="What did you eat?"
              placeholderTextColor={text.faint}
              maxLength={80}
            />
            <View style={styles.searchRow}>
              <TextInput
                value={mKcal}
                onChangeText={(v) => setMKcal(v.replace(/[^0-9]/g, ''))}
                style={[styles.input, styles.searchInput]}
                keyboardType="number-pad"
                placeholder="kcal"
                placeholderTextColor={text.faint}
                maxLength={5}
              />
              <TextInput
                value={mProtein}
                onChangeText={(v) => setMProtein(v.replace(/[^0-9]/g, ''))}
                style={[styles.input, styles.searchInput]}
                keyboardType="number-pad"
                placeholder="protein g"
                placeholderTextColor={text.faint}
                maxLength={3}
              />
              <TextInput
                value={mFibre}
                onChangeText={(v) => setMFibre(v.replace(/[^0-9]/g, ''))}
                style={[styles.input, styles.searchInput]}
                keyboardType="number-pad"
                placeholder="fibre g"
                placeholderTextColor={text.faint}
                maxLength={3}
              />
            </View>
            <View style={styles.searchRow}>
              <Pressable onPress={addManual} style={({ pressed }) => [styles.btn, styles.flex1, pressed && { opacity: 0.8 }]}>
                <Text style={styles.btnText}>Add</Text>
              </Pressable>
              <Pressable onPress={() => setManual(false)} style={({ pressed }) => [styles.searchBtn, pressed && { opacity: 0.7 }]}>
                <Text style={[styles.searchBtnText, { color: text.secondary }]}>Search instead</Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    backgroundColor: surface.base,
  },
  btn: { backgroundColor: accent, borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: onAccent, fontSize: 14, fontWeight: '700' },
  flex1: { flex: 1 },
  targetRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 8 },
  bigNum: { color: text.primary, fontSize: 26, fontWeight: '700' },
  targetMeta: { color: text.secondary, fontSize: 13 },
  macros: { gap: 8, marginTop: 12 },
  macro: { gap: 4 },
  macroLabel: { color: text.secondary, fontSize: 12 },
  macroVal: { color: text.primary, fontWeight: '700' },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginTop: 12 },
  subMeta: { color: text.secondary, fontSize: 11, flex: 1, lineHeight: 16 },
  editLink: { color: TONE, fontSize: 12, fontWeight: '700' },
  gentle: { color: feedback.gold, fontSize: 12, marginTop: 8 },
  entries: { marginTop: 14, gap: 2 },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  entryMain: { flex: 1 },
  entryName: { color: text.primary, fontSize: 13 },
  entryMeta: { color: text.faint, fontSize: 11, marginTop: 1 },
  remove: { color: text.faint, fontSize: 20, fontWeight: '700', marginTop: -2 },
  suggest: { marginTop: 16 },
  suggestTitle: { color: text.primary, fontSize: 14, fontWeight: '700' },
  suggestHint: { color: text.faint, fontSize: 11, marginTop: 2, marginBottom: 8 },
  group: { marginTop: 6 },
  groupLabel: { color: TONE, fontSize: 11, fontWeight: '700', letterSpacing: 0.4, marginBottom: 2 },
  sugRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  sugMain: { flex: 1 },
  sugName: { color: text.primary, fontSize: 13 },
  sugMeta: { color: text.faint, fontSize: 11, marginTop: 1 },
  plus: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: surface.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plusText: { color: TONE, fontSize: 20, fontWeight: '700', marginTop: -2 },
  photoBox: { marginTop: 16 },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 9,
    paddingVertical: 11,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: withAlpha(TONE, 0.5),
    backgroundColor: withAlpha(TONE, 0.06),
  },
  photoBtnText: { color: TONE, fontSize: 14, fontWeight: '700' },
  estimate: {
    borderWidth: 1,
    borderColor: withAlpha(TONE, 0.4),
    borderRadius: 11,
    padding: 12,
    backgroundColor: withAlpha(TONE, 0.05),
  },
  estimateTitle: { color: text.primary, fontSize: 13, fontWeight: '700', marginBottom: 10 },
  estimateNote: { color: text.secondary, fontSize: 11, lineHeight: 16, marginBottom: 8 },
  addBox: { marginTop: 16 },
  searchRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  searchInput: { flex: 1 },
  searchBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 74,
    alignItems: 'center',
  },
  searchBtnText: { fontSize: 13, fontWeight: '700' },
  searchNote: { color: text.secondary, fontSize: 12, marginBottom: 8 },
  result: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  resultName: { color: text.primary, fontSize: 13, flex: 1 },
  resultBrand: { color: text.faint },
  resultKcal: { color: text.secondary, fontSize: 11 },
  gramsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  gramsInput: { width: 84, marginBottom: 0 },
  gramsPreview: { color: text.secondary, fontSize: 12, flex: 1 },
  addBtn: { backgroundColor: TONE, borderRadius: 9, paddingVertical: 9, paddingHorizontal: 16 },
  addBtnText: { color: onAccent, fontSize: 13, fontWeight: '700' },
  manualLink: { color: text.faint, fontSize: 12, marginTop: 10, textDecorationLine: 'underline' },
});
