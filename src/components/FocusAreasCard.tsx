import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, onAccent, STAT_KEYS, STAT_META, surface, text, withAlpha } from '@/theme';

type SaveState = 'idle' | 'saving' | 'done';

// Tap-to-add focus suggestions for the less-obvious attributes. Tapping one adds
// it to that attribute's focus set (same as typing it). Extend per stat as needed.
const FOCUS_SUGGESTIONS: Record<string, string[]> = {
  WLT: ['Investing', 'Budgeting', 'Side income', 'Business', 'Saving', 'Money mindset'],
  CFT: ['System design', 'Algorithms (DSA)', 'Testing', 'Refactoring', 'Design patterns', 'A side project'],
};

/** Per-attribute focuses (+ optional "where I'm at" for the AI). Themes each
 * attribute's side quest and steers LLM sequencing. */
export function FocusAreasCard() {
  const state = useSystem((s) => s.state);
  const savePreferences = useSystem((s) => s.savePreferences);

  const prefsKey = JSON.stringify(state?.preferences ?? {});
  const levelsKey = JSON.stringify(state?.levels ?? {});
  const [focusDraft, setFocusDraft] = useState<Record<string, string[]>>({});
  const [focusInput, setFocusInput] = useState<Record<string, string>>({});
  const [levelDraft, setLevelDraft] = useState<Record<string, string>>({});
  const [removedFocus, setRemovedFocus] = useState<{ stat: string; item: string; index: number } | null>(
    null,
  );
  const [focusSave, setFocusSave] = useState<SaveState>('idle');

  // Reset the drafts when the saved values actually change (keyed on their
  // values, so a background refresh doesn't clobber mid-edit typing).
  useEffect(() => {
    const p = state?.preferences ?? {};
    setFocusDraft(Object.fromEntries(STAT_KEYS.map((k) => [k, p[k] ?? []])));
    setRemovedFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefsKey]);
  useEffect(() => {
    const l = state?.levels ?? {};
    setLevelDraft(Object.fromEntries(STAT_KEYS.map((k) => [k, l[k] ?? ''])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelsKey]);

  if (!state) return null;

  // Persist the whole set immediately on any chip change, so nothing is lost to a
  // forgotten "Save" — the exact trap that hid the Wealth/Craft pills' additions.
  const persist = (focus: Record<string, string[]>, levels: Record<string, string>) => {
    const mergedFocus: Record<string, string[]> = {};
    const mergedLevels: Record<string, string> = {};
    for (const k of STAT_KEYS) {
      mergedFocus[k] = [...(focus[k] ?? [])];
      mergedLevels[k] = (levels[k] ?? '').trim();
    }
    void savePreferences(mergedFocus, mergedLevels);
  };

  const addFocus = (k: string) => {
    const v = (focusInput[k] ?? '').trim();
    setFocusInput((s) => ({ ...s, [k]: '' }));
    setRemovedFocus(null);
    if (!v) return;
    const cur = focusDraft[k] ?? [];
    if (cur.some((x) => x.toLowerCase() === v.toLowerCase())) return; // no dupes
    const next = { ...focusDraft, [k]: [...cur, v] };
    setFocusDraft(next);
    persist(next, levelDraft);
  };

  const addSuggestedFocus = (k: string, v: string) => {
    setRemovedFocus(null);
    const cur = focusDraft[k] ?? [];
    if (cur.some((x) => x.toLowerCase() === v.toLowerCase())) return; // no dupes
    const next = { ...focusDraft, [k]: [...cur, v] };
    setFocusDraft(next);
    persist(next, levelDraft);
  };

  const removeFocus = (k: string, i: number) => {
    const item = (focusDraft[k] ?? [])[i];
    if (item == null) return;
    const next = { ...focusDraft, [k]: (focusDraft[k] ?? []).filter((_, idx) => idx !== i) };
    setRemovedFocus({ stat: k, item, index: i });
    setFocusDraft(next);
    persist(next, levelDraft);
  };

  const undoRemoveFocus = () => {
    if (!removedFocus) return;
    const { stat, item, index } = removedFocus;
    setRemovedFocus(null);
    const cur = focusDraft[stat] ?? [];
    if (cur.some((x) => x.toLowerCase() === item.toLowerCase())) return; // already back
    const arr = [...cur];
    arr.splice(Math.min(index, arr.length), 0, item);
    const next = { ...focusDraft, [stat]: arr };
    setFocusDraft(next);
    persist(next, levelDraft);
  };

  const saveFocusFlow = async () => {
    setFocusSave('saving');
    setRemovedFocus(null);
    // Fold in any text still sitting in an add-field, so typing then Save works
    // even if you didn't tap Add first.
    const merged: Record<string, string[]> = {};
    for (const k of STAT_KEYS) {
      const cur = [...(focusDraft[k] ?? [])];
      const pending = (focusInput[k] ?? '').trim();
      if (pending && !cur.some((x) => x.toLowerCase() === pending.toLowerCase())) {
        cur.push(pending);
      }
      merged[k] = cur;
    }
    setFocusDraft(merged);
    setFocusInput({});
    const levels: Record<string, string> = {};
    for (const k of STAT_KEYS) levels[k] = (levelDraft[k] ?? '').trim();
    await savePreferences(merged, levels);
    if (useSystem.getState().status === 'online') {
      setFocusSave('done');
      setTimeout(() => setFocusSave('idle'), 1600);
    } else {
      setFocusSave('idle');
    }
  };

  return (
    <SystemPanel title="Focus areas" sub={state.llm_enabled ? 'AI personalisation on' : undefined}>
      <Text style={styles.help}>
        Optional. Add as many focuses as you like per attribute — each attribute&apos;s side quest
        rotates through them. Solid chips are on (tap × to remove); dashed pills are suggestions —
        tap to add. Focuses save as soon as you add or remove them.
        {state.llm_enabled
          ? ' “Where I’m at” tells the AI your level so it can prescribe your next step.'
          : ' “Where I’m at” is used once you turn on AI personalisation.'}
      </Text>
      {STAT_KEYS.map((k) => {
        const items = focusDraft[k] ?? [];
        return (
          <View key={k} style={styles.focusRow}>
            <Text style={[styles.focusLabel, { color: STAT_META[k].color }]}>{STAT_META[k].label}</Text>
            {items.length > 0 ? (
              <View style={styles.chips}>
                {items.map((item, i) => (
                  <Pressable
                    key={`${item}-${i}`}
                    onPress={() => removeFocus(k, i)}
                    style={[styles.chip, { backgroundColor: withAlpha(STAT_META[k].color, 0.12) }]}
                  >
                    <Text style={[styles.chipText, { color: STAT_META[k].color }]}>{item}</Text>
                    <Text style={[styles.chipX, { color: STAT_META[k].color }]}>×</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {(FOCUS_SUGGESTIONS[k] ?? []).some(
              (s) => !items.some((x) => x.toLowerCase() === s.toLowerCase()),
            ) ? (
              <View style={styles.suggestChips}>
                {(FOCUS_SUGGESTIONS[k] ?? [])
                  .filter((s) => !items.some((x) => x.toLowerCase() === s.toLowerCase()))
                  .map((s) => (
                    <Pressable
                      key={s}
                      onPress={() => addSuggestedFocus(k, s)}
                      style={({ pressed }) => [
                        styles.suggestChip,
                        { borderColor: withAlpha(STAT_META[k].color, 0.45) },
                        pressed && { backgroundColor: withAlpha(STAT_META[k].color, 0.1) },
                      ]}
                    >
                      <Text style={[styles.suggestChipText, { color: STAT_META[k].color }]}>+ {s}</Text>
                    </Pressable>
                  ))}
              </View>
            ) : null}
            <View style={styles.addRow}>
              <TextInput
                value={focusInput[k] ?? ''}
                onChangeText={(v) => setFocusInput((s) => ({ ...s, [k]: v }))}
                onSubmitEditing={() => addFocus(k)}
                blurOnSubmit={false}
                returnKeyType="done"
                style={[styles.input, styles.addInput]}
                placeholder={`Add a focus · e.g. ${STAT_META[k].sub.toLowerCase()}`}
                placeholderTextColor={text.faint}
                maxLength={60}
              />
              <Pressable
                onPress={() => addFocus(k)}
                style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
              >
                <Text style={[styles.addBtnText, { color: STAT_META[k].color }]}>Add</Text>
              </Pressable>
            </View>
            <TextInput
              value={levelDraft[k] ?? ''}
              onChangeText={(v) => setLevelDraft((s) => ({ ...s, [k]: v }))}
              onEndEditing={() => persist(focusDraft, levelDraft)}
              style={[styles.input, styles.levelInput]}
              placeholder="Where I'm at (for AI) · e.g. Math: fractions"
              placeholderTextColor={text.faint}
              maxLength={120}
            />
          </View>
        );
      })}
      {removedFocus ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoBarText} numberOfLines={1}>
            Removed “{removedFocus.item}”
          </Text>
          <Pressable onPress={undoRemoveFocus} hitSlop={8}>
            <Text style={styles.undoBarBtn}>Undo</Text>
          </Pressable>
        </View>
      ) : null}
      <Pressable
        disabled={focusSave === 'saving'}
        style={({ pressed }) => [styles.btn, (pressed || focusSave === 'saving') && { opacity: 0.8 }]}
        onPress={saveFocusFlow}
      >
        <Text style={styles.btnText}>
          {focusSave === 'saving' ? 'Saving…' : focusSave === 'done' ? 'Saved ✓' : 'Save notes'}
        </Text>
      </Pressable>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  help: { color: text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
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
  focusRow: { marginBottom: 14 },
  focusLabel: { fontSize: 12, fontWeight: '700', marginBottom: 7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  chipText: { fontSize: 12, fontWeight: '600' },
  chipX: { fontSize: 15, fontWeight: '700', marginTop: -1 },
  suggestChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  suggestChip: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 99, paddingVertical: 5, paddingHorizontal: 11 },
  suggestChipText: { fontSize: 12, fontWeight: '600' },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  addInput: { flex: 1, marginBottom: 0 },
  levelInput: { marginTop: 8, marginBottom: 0, fontSize: 13 },
  addBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  addBtnText: { fontSize: 13, fontWeight: '700' },
  undoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: surface.base,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  undoBarText: { color: text.secondary, fontSize: 13, flex: 1 },
  undoBarBtn: { color: accent, fontSize: 13, fontWeight: '700' },
});
