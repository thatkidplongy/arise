import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiBodyProfile } from '@/lib/api';
import { useBody } from '@/query/useBody';
import { accent, onAccent, STAT_META, surface, text } from '@/theme';

const TONE = STAT_META.CFT.color;
const SEX = [
  { key: 'male', label: 'Male' },
  { key: 'female', label: 'Female' },
  { key: 'unspecified', label: 'Rather not' },
];
const ACTIVITY = [
  { key: 'sedentary', label: 'Sedentary' },
  { key: 'light', label: 'Light' },
  { key: 'moderate', label: 'Moderate' },
  { key: 'active', label: 'Active' },
  { key: 'very_active', label: 'Very active' },
];
// Where you are — picks the local "what to eat" library so suggestions are foods
// you can actually find. Add more as the backend grows its regional sets.
const COUNTRY = [
  { key: '', label: 'Worldwide' },
  { key: 'PH', label: 'Philippines' },
];

function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <View style={styles.segments}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.segment, on && { backgroundColor: TONE, borderColor: TONE }]}
          >
            <Text style={[styles.segmentText, on && { color: onAccent }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function num(v: string, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

/** The one-time body inputs (sex, age, height, weight, activity, location, goal).
 * Owns its own drafts; `onDone` closes it (after a save, or on cancel). */
export function NutritionProfileForm({
  profile,
  onDone,
}: {
  profile: ApiBodyProfile | null;
  onDone: () => void;
}) {
  const { saveProfile } = useBody();
  const [sex, setSex] = useState(profile?.sex ?? 'unspecified');
  const [age, setAge] = useState(profile?.age ? String(profile.age) : '');
  const [height, setHeight] = useState(profile?.height_cm ? String(profile.height_cm) : '');
  const [weight, setWeight] = useState(profile?.weight_kg ? String(profile.weight_kg) : '');
  const [activity, setActivity] = useState(profile?.activity ?? 'moderate');
  const [goalWeight, setGoalWeight] = useState(profile?.goal_weight_kg ? String(profile.goal_weight_kg) : '');
  const [country, setCountry] = useState(profile?.country ?? '');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const p: ApiBodyProfile = {
      sex,
      age: Math.round(num(age)),
      height_cm: Math.round(num(height)),
      weight_kg: num(weight),
      activity,
      goal: profile?.goal ?? 'maintain', // fallback when no goal weight is set
      goal_weight_kg: num(goalWeight),
      country,
    };
    setSaving(true);
    await saveProfile(p);
    setSaving(false);
    onDone();
  };

  const h = num(height) / 100;
  const range = h > 0 ? [Math.round(18.5 * h * h), Math.round(24.9 * h * h)] : null;

  return (
    <>
      <Text style={styles.help}>
        A quick estimate of your daily energy, protein and fibre — a range to aim inside, never a
        hard line. Set a goal weight and Arise points you gently toward it. It’s a guide, not a
        rule, and an estimate only — not medical or nutrition advice.
      </Text>
      <Text style={styles.fieldLabel}>Sex (for the estimate)</Text>
      <Segmented options={SEX} value={sex} onChange={setSex} />
      <View style={styles.triple}>
        <View style={styles.tripleCol}>
          <Text style={styles.fieldLabel}>Age</Text>
          <TextInput
            value={age}
            onChangeText={(v) => setAge(v.replace(/[^0-9]/g, ''))}
            style={styles.input}
            keyboardType="number-pad"
            placeholder="28"
            placeholderTextColor={text.faint}
            maxLength={3}
          />
        </View>
        <View style={styles.tripleCol}>
          <Text style={styles.fieldLabel}>Height (cm)</Text>
          <TextInput
            value={height}
            onChangeText={(v) => setHeight(v.replace(/[^0-9]/g, ''))}
            style={styles.input}
            keyboardType="number-pad"
            placeholder="163"
            placeholderTextColor={text.faint}
            maxLength={3}
          />
        </View>
        <View style={styles.tripleCol}>
          <Text style={styles.fieldLabel}>Weight (kg)</Text>
          <TextInput
            value={weight}
            onChangeText={(v) => setWeight(v.replace(/[^0-9.]/g, ''))}
            style={styles.input}
            keyboardType="decimal-pad"
            placeholder="76"
            placeholderTextColor={text.faint}
            maxLength={5}
          />
        </View>
      </View>
      <Text style={styles.fieldLabel}>Activity</Text>
      <Segmented options={ACTIVITY} value={activity} onChange={setActivity} />
      <Text style={styles.fieldLabel}>Where you are</Text>
      <Segmented options={COUNTRY} value={country} onChange={setCountry} />
      <Text style={styles.hint}>Tunes the “what to eat” picks to foods you can actually find locally.</Text>
      <Text style={styles.fieldLabel}>Goal weight (kg)</Text>
      <TextInput
        value={goalWeight}
        onChangeText={(v) => setGoalWeight(v.replace(/[^0-9.]/g, ''))}
        style={styles.input}
        keyboardType="decimal-pad"
        placeholder="e.g. 65"
        placeholderTextColor={text.faint}
        maxLength={5}
      />
      {range ? (
        <Text style={styles.hint}>
          Healthy range for your height: {range[0]}–{range[1]} kg. Leave blank to just maintain.
        </Text>
      ) : null}
      <Pressable
        disabled={saving}
        onPress={submit}
        style={({ pressed }) => [styles.btn, (pressed || saving) && { opacity: 0.8 }]}
      >
        <Text style={styles.btnText}>{saving ? 'Saving…' : 'Save targets'}</Text>
      </Pressable>
      {profile ? (
        <Pressable onPress={onDone}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  help: { color: text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  fieldLabel: { color: text.secondary, fontSize: 12, fontWeight: '700', marginBottom: 7, marginTop: 4 },
  hint: { color: text.faint, fontSize: 12, lineHeight: 17, marginBottom: 10, marginTop: -2 },
  segments: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  segment: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 99,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  segmentText: { color: text.secondary, fontSize: 12, fontWeight: '600' },
  triple: { flexDirection: 'row', gap: 8 },
  tripleCol: { flex: 1 },
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
  cancel: { color: text.faint, textAlign: 'center', marginTop: 10, fontSize: 13 },
});
