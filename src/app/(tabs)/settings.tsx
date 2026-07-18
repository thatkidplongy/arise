import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, STAT_KEYS, STAT_META, surface, text, withAlpha } from '@/theme';

type SaveState = 'idle' | 'saving' | 'done';

export default function SettingsScreen() {
  const state = useSystem((s) => s.state);
  const status = useSystem((s) => s.status);
  const serverUrl = useSystem((s) => s.serverUrl);
  const setServerUrl = useSystem((s) => s.setServerUrl);
  const apiToken = useSystem((s) => s.apiToken);
  const setApiToken = useSystem((s) => s.setApiToken);
  const saveName = useSystem((s) => s.saveName);
  const saveNorthStar = useSystem((s) => s.saveNorthStar);
  const saveBook = useSystem((s) => s.saveBook);
  const savePreferences = useSystem((s) => s.savePreferences);
  const resetAll = useSystem((s) => s.resetAll);
  const refresh = useSystem((s) => s.refresh);

  const prefsKey = JSON.stringify(state?.preferences ?? {});
  const levelsKey = JSON.stringify(state?.levels ?? {});
  const [nameDraft, setNameDraft] = useState(state?.player.name ?? '');
  const [northStarDraft, setNorthStarDraft] = useState(state?.player.north_star ?? '');
  const [bookDraft, setBookDraft] = useState(state?.player.current_book ?? '');
  const [urlDraft, setUrlDraft] = useState(serverUrl);
  const [tokenDraft, setTokenDraft] = useState(apiToken);
  const [focusDraft, setFocusDraft] = useState<Record<string, string[]>>({});
  const [focusInput, setFocusInput] = useState<Record<string, string>>({});
  const [levelDraft, setLevelDraft] = useState<Record<string, string>>({});
  const [removedFocus, setRemovedFocus] = useState<{ stat: string; item: string; index: number } | null>(
    null,
  );
  const [confirmReset, setConfirmReset] = useState(false);
  const [nameSave, setNameSave] = useState<SaveState>('idle');
  const [northStarSave, setNorthStarSave] = useState<SaveState>('idle');
  const [bookSave, setBookSave] = useState<SaveState>('idle');
  const [linkSave, setLinkSave] = useState<SaveState>('idle');
  const [focusSave, setFocusSave] = useState<SaveState>('idle');
  const [resetting, setResetting] = useState(false);

  useEffect(() => setNameDraft(state?.player.name ?? ''), [state?.player.name]);
  useEffect(() => setNorthStarDraft(state?.player.north_star ?? ''), [state?.player.north_star]);
  useEffect(() => setBookDraft(state?.player.current_book ?? ''), [state?.player.current_book]);
  useEffect(() => setUrlDraft(serverUrl), [serverUrl]);
  useEffect(() => setTokenDraft(apiToken), [apiToken]);
  // Reset the focus drafts when the saved preferences actually change (keyed on
  // their values, so a background refresh doesn't clobber mid-edit typing).
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

  const addFocus = (k: string) => {
    const v = (focusInput[k] ?? '').trim();
    if (!v) return;
    setFocusDraft((d) => {
      const cur = d[k] ?? [];
      if (cur.some((x) => x.toLowerCase() === v.toLowerCase())) return d; // no dupes
      return { ...d, [k]: [...cur, v] };
    });
    setFocusInput((s) => ({ ...s, [k]: '' }));
    setRemovedFocus(null);
  };

  const removeFocus = (k: string, i: number) => {
    const item = (focusDraft[k] ?? [])[i];
    if (item == null) return;
    setRemovedFocus({ stat: k, item, index: i });
    setFocusDraft((d) => ({ ...d, [k]: (d[k] ?? []).filter((_, idx) => idx !== i) }));
  };

  const undoRemoveFocus = () => {
    if (!removedFocus) return;
    const { stat, item, index } = removedFocus;
    setFocusDraft((d) => {
      const cur = d[stat] ?? [];
      if (cur.some((x) => x.toLowerCase() === item.toLowerCase())) return d; // already back
      const next = [...cur];
      next.splice(Math.min(index, next.length), 0, item);
      return { ...d, [stat]: next };
    });
    setRemovedFocus(null);
  };

  // Show "Saved" briefly on success; drop back to idle if the call failed
  // (a failure already surfaces via the link status / a notice).
  const settle = (set: (s: SaveState) => void) => {
    if (useSystem.getState().status === 'online') {
      set('done');
      setTimeout(() => set('idle'), 1600);
    } else {
      set('idle');
    }
  };

  const saveLink = async () => {
    setLinkSave('saving');
    setApiToken(tokenDraft);
    setServerUrl(urlDraft);
    await refresh();
    settle(setLinkSave);
  };

  const saveNameFlow = async () => {
    if (!nameDraft.trim()) return;
    setNameSave('saving');
    await saveName(nameDraft.trim());
    settle(setNameSave);
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
    settle(setFocusSave);
  };

  const saveNorthStarFlow = async () => {
    setNorthStarSave('saving');
    await saveNorthStar(northStarDraft.trim());
    settle(setNorthStarSave);
  };

  const saveBookFlow = async () => {
    setBookSave('saving');
    await saveBook(bookDraft.trim());
    settle(setBookSave);
  };

  const statusColor =
    status === 'online'
      ? feedback.success
      : status === 'offline' || status === 'unauthorized'
        ? feedback.danger
        : text.faint;

  const statusMessage =
    status === 'online'
      ? 'Connected to the System server.'
      : status === 'unauthorized'
        ? 'Access token rejected. Enter the correct token below.'
        : status === 'offline'
          ? 'Server unreachable. Check the address and that the backend is running.'
          : 'Connecting…';

  return (
    <Screen>
      <Text style={styles.h1}>Settings</Text>

      {state ? (
        <SystemPanel title="Your North Star">
          <Text style={styles.help}>
            The life you’re reaching for, in your own words — who you want to be, why you’re doing
            this. It stays at the top of your Status as a reminder. No wrong answer.
          </Text>
          <TextInput
            value={northStarDraft}
            onChangeText={setNorthStarDraft}
            style={[styles.input, styles.multiline]}
            placeholder="e.g. Someone I’m proud to see in the mirror — strong, creative, present, still growing."
            placeholderTextColor={text.faint}
            multiline
            maxLength={280}
          />
          <Pressable
            disabled={northStarSave === 'saving'}
            style={({ pressed }) => [styles.btn, (pressed || northStarSave === 'saving') && { opacity: 0.8 }]}
            onPress={saveNorthStarFlow}
          >
            <Text style={styles.btnText}>
              {northStarSave === 'saving' ? 'Saving…' : northStarSave === 'done' ? 'Saved ✓' : 'Save North Star'}
            </Text>
          </Pressable>
        </SystemPanel>
      ) : null}

      {state ? (
        <SystemPanel title="Current book" sub={`${state.player.books_finished} finished`}>
          <Text style={styles.help}>
            What you’re reading now. Your Grow daily is to read a chapter of it — a chapter a day, a
            book a week. At each new week, Arise asks if you finished it and what’s next.
          </Text>
          <TextInput
            value={bookDraft}
            onChangeText={setBookDraft}
            style={styles.input}
            placeholder="e.g. Atomic Habits — James Clear"
            placeholderTextColor={text.faint}
            maxLength={120}
          />
          <Pressable
            disabled={bookSave === 'saving'}
            style={({ pressed }) => [styles.btn, (pressed || bookSave === 'saving') && { opacity: 0.8 }]}
            onPress={saveBookFlow}
          >
            <Text style={styles.btnText}>
              {bookSave === 'saving' ? 'Saving…' : bookSave === 'done' ? 'Saved ✓' : 'Save book'}
            </Text>
          </Pressable>
        </SystemPanel>
      ) : null}

      <SystemPanel title="System link" sub={status}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.line}>{statusMessage}</Text>
        </View>
        <TextInput
          value={urlDraft}
          onChangeText={setUrlDraft}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://yourhunter.duckdns.org"
          placeholderTextColor={text.faint}
        />
        <TextInput
          value={tokenDraft}
          onChangeText={setTokenDraft}
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Access token (leave blank for local)"
          placeholderTextColor={text.faint}
        />
        <Pressable
          disabled={linkSave === 'saving'}
          style={({ pressed }) => [styles.btn, (pressed || linkSave === 'saving') && { opacity: 0.8 }]}
          onPress={saveLink}
        >
          <Text style={styles.btnText}>
            {linkSave === 'saving'
              ? 'Reconnecting…'
              : linkSave === 'done'
                ? 'Reconnected ✓'
                : 'Save and reconnect'}
          </Text>
        </Pressable>
      </SystemPanel>

      <SystemPanel title="Hunter name">
        <TextInput
          value={nameDraft}
          onChangeText={setNameDraft}
          style={styles.input}
          placeholder="Enter hunter name"
          placeholderTextColor={text.faint}
          maxLength={24}
        />
        <Pressable
          disabled={nameSave === 'saving'}
          style={({ pressed }) => [styles.btn, (pressed || nameSave === 'saving') && { opacity: 0.8 }]}
          onPress={saveNameFlow}
        >
          <Text style={styles.btnText}>
            {nameSave === 'saving' ? 'Saving…' : nameSave === 'done' ? 'Saved ✓' : 'Save'}
          </Text>
        </Pressable>
      </SystemPanel>

      {state ? (
        <SystemPanel title="Focus areas" sub={state.llm_enabled ? 'AI personalisation on' : undefined}>
          <Text style={styles.help}>
            Optional. Add as many focuses as you like per attribute — each attribute&apos;s side
            quest rotates through them. Adding one keeps the rest; tap × to remove.
            {state.llm_enabled
              ? ' “Where I’m at” tells the AI your level so it can prescribe your next step.'
              : ' “Where I’m at” is used once you turn on AI personalisation.'}
          </Text>
          {STAT_KEYS.map((k) => {
            const items = focusDraft[k] ?? [];
            return (
              <View key={k} style={styles.focusRow}>
                <Text style={[styles.focusLabel, { color: STAT_META[k].color }]}>
                  {STAT_META[k].label}
                </Text>
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
              {focusSave === 'saving' ? 'Saving…' : focusSave === 'done' ? 'Saved ✓' : 'Save focuses'}
            </Text>
          </Pressable>
        </SystemPanel>
      ) : null}

      {state ? (
        <SystemPanel title="Record">
          <Text style={styles.recordLine}>
            Awakened on {new Date(state.player.created_at).toDateString()}
          </Text>
          <Text style={styles.recordLine}>Active days: {state.record.active_days}</Text>
          <Text style={styles.recordLine}>Quests completed: {state.record.total_completions}</Text>
        </SystemPanel>
      ) : null}

      <SystemPanel title="Danger zone">
        <Pressable
          disabled={resetting}
          style={({ pressed }) => [styles.dangerBtn, (pressed || resetting) && { opacity: 0.85 }]}
          onPress={async () => {
            if (resetting) return;
            if (confirmReset) {
              setResetting(true);
              await resetAll();
              setResetting(false);
              setConfirmReset(false);
            } else {
              setConfirmReset(true);
            }
          }}
        >
          <Text style={styles.dangerText}>
            {resetting
              ? 'Resetting…'
              : confirmReset
                ? 'Tap again to erase all progress'
                : 'Reset all data'}
          </Text>
        </Pressable>
        {confirmReset && !resetting ? (
          <Pressable onPress={() => setConfirmReset(false)}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        ) : null}
      </SystemPanel>

      <Text style={styles.footer}>Arise · a personal System, inspired by Solo Leveling</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: {
    color: text.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
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
  multiline: {
    minHeight: 92,
    textAlignVertical: 'top',
    lineHeight: 20,
  },
  btn: {
    backgroundColor: accent,
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
  },
  btnText: {
    color: '#FBF5EB',
    fontSize: 14,
    fontWeight: '700',
  },
  line: {
    color: text.secondary,
    fontSize: 13,
    lineHeight: 20,
    flex: 1,
  },
  help: {
    color: text.secondary,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 12,
  },
  focusRow: {
    marginBottom: 14,
  },
  focusLabel: {
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 7,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  chipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  chipX: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: -1,
  },
  addRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addInput: {
    flex: 1,
    marginBottom: 0,
  },
  levelInput: {
    marginTop: 8,
    marginBottom: 0,
    fontSize: 13,
  },
  addBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  addBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
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
  undoBarText: {
    color: text.secondary,
    fontSize: 13,
    flex: 1,
  },
  undoBarBtn: {
    color: accent,
    fontSize: 13,
    fontWeight: '700',
  },
  recordLine: {
    color: text.primary,
    fontSize: 13,
    lineHeight: 22,
  },
  dangerBtn: {
    borderWidth: 1,
    borderColor: feedback.danger,
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
  },
  dangerText: {
    color: feedback.danger,
    fontSize: 14,
    fontWeight: '600',
  },
  cancel: {
    color: text.faint,
    textAlign: 'center',
    marginTop: 10,
    fontSize: 13,
  },
  footer: {
    color: text.faint,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 8,
  },
});
