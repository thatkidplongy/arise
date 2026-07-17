import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { activeDayKeys, totalCompletions } from '@/lib/selectors';
import { useSystem } from '@/store/useSystem';
import { colors, withAlpha } from '@/theme';

export default function SettingsScreen() {
  const name = useSystem((s) => s.name);
  const setName = useSystem((s) => s.setName);
  const resetAll = useSystem((s) => s.resetAll);
  const createdAt = useSystem((s) => s.createdAt);
  const log = useSystem((s) => s.log);

  const [draft, setDraft] = useState(name);
  const [confirmReset, setConfirmReset] = useState(false);

  // Persisted state loads asynchronously after mount; sync the input when it lands.
  useEffect(() => setDraft(name), [name]);

  return (
    <Screen>
      <Text style={styles.h1}>SETTINGS</Text>

      <SystemPanel title="HUNTER NAME">
        <TextInput
          value={draft}
          onChangeText={setDraft}
          style={styles.input}
          placeholder="Enter hunter name"
          placeholderTextColor={colors.textDim}
          maxLength={24}
        />
        <Pressable
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
          onPress={() => setName(draft.trim() || 'Hunter')}
        >
          <Text style={styles.btnText}>SAVE</Text>
        </Pressable>
      </SystemPanel>

      <SystemPanel title="RECORD">
        <Text style={styles.line}>Awakened on {new Date(createdAt).toDateString()}</Text>
        <Text style={styles.line}>Active days: {activeDayKeys(log).length}</Text>
        <Text style={styles.line}>Quests completed: {totalCompletions(log)}</Text>
      </SystemPanel>

      <SystemPanel title="DANGER ZONE">
        <Pressable
          style={({ pressed }) => [styles.btn, styles.dangerBtn, pressed && styles.btnPressed]}
          onPress={() => {
            if (confirmReset) {
              resetAll();
              setConfirmReset(false);
            } else {
              setConfirmReset(true);
            }
          }}
        >
          <Text style={styles.dangerText}>
            {confirmReset ? 'TAP AGAIN TO ERASE ALL PROGRESS' : 'RESET ALL DATA'}
          </Text>
        </Pressable>
        {confirmReset ? (
          <Pressable onPress={() => setConfirmReset(false)}>
            <Text style={styles.cancel}>Cancel</Text>
          </Pressable>
        ) : null}
      </SystemPanel>

      <Text style={styles.footer}>ARISE v1.0 · a personal System, inspired by Solo Leveling</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    marginBottom: 10,
  },
  btn: {
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 6,
    paddingVertical: 10,
    alignItems: 'center',
  },
  btnPressed: {
    backgroundColor: withAlpha(colors.primary, 0.12),
  },
  btnText: {
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 2,
    fontSize: 13,
  },
  line: {
    color: colors.text,
    fontSize: 13,
    lineHeight: 22,
  },
  dangerBtn: {
    borderColor: colors.danger,
  },
  dangerText: {
    color: colors.danger,
    fontWeight: '700',
    letterSpacing: 1,
    fontSize: 13,
  },
  cancel: {
    color: colors.textDim,
    textAlign: 'center',
    marginTop: 10,
    fontSize: 13,
  },
  footer: {
    color: colors.textDim,
    textAlign: 'center',
    fontSize: 11,
    marginTop: 8,
  },
});
