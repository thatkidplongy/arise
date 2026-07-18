import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import type { ApiSkincareStep } from '@/lib/api';
import { useBody } from '@/store/useBody';
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
  const toggleStep = useBody((s) => s.toggleStep);
  const addStep = useBody((s) => s.addStep);
  const removeStep = useBody((s) => s.removeStep);
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

export function SkincarePanel() {
  const body = useBody((s) => s.body);
  if (!body) return null;

  return (
    <SystemPanel title="Skincare" sub="pigmentation & pores">
      <Text style={styles.note}>{body.skincare_note}</Text>
      <Routine title="Morning" icon="sunny-outline" routine="AM" steps={body.skincare_am} />
      <Routine title="Evening" icon="moon-outline" routine="PM" steps={body.skincare_pm} />
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
  resources: { marginTop: 4, gap: 5 },
  resourcesLabel: { color: text.faint, fontSize: 10, fontWeight: '700', letterSpacing: 1.2, marginBottom: 2 },
  resource: { color: text.secondary, fontSize: 12, lineHeight: 18 },
});
