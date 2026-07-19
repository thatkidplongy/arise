import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { saveLabel, useSaveState } from '@/hooks/useSaveState';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, onAccent, surface, text } from '@/theme';

export default function SettingsScreen() {
  const state = useSystem((s) => s.state);
  const status = useSystem((s) => s.status);
  const serverUrl = useSystem((s) => s.serverUrl);
  const setServerUrl = useSystem((s) => s.setServerUrl);
  const apiToken = useSystem((s) => s.apiToken);
  const setApiToken = useSystem((s) => s.setApiToken);
  const saveName = useSystem((s) => s.saveName);
  const saveNorthStar = useSystem((s) => s.saveNorthStar);
  const resetAll = useSystem((s) => s.resetAll);
  const refresh = useSystem((s) => s.refresh);

  const [nameDraft, setNameDraft] = useState(state?.player.name ?? '');
  const [northStarDraft, setNorthStarDraft] = useState(state?.player.north_star ?? '');
  const [urlDraft, setUrlDraft] = useState(serverUrl);
  const [tokenDraft, setTokenDraft] = useState(apiToken);
  const [confirmReset, setConfirmReset] = useState(false);
  const nameSave = useSaveState();
  const northStarSave = useSaveState();
  const linkSave = useSaveState();
  const [resetting, setResetting] = useState(false);

  // Keep each draft synced to its source, resetting only when that source itself
  // changes — React's "adjust state during render" pattern (no effect, no cascade).
  // Each check is independent so editing one field isn't clobbered by another's sync.
  const srcName = state?.player.name ?? '';
  const srcNorthStar = state?.player.north_star ?? '';
  const [seeds, setSeeds] = useState({ name: srcName, northStar: srcNorthStar, url: serverUrl, token: apiToken });
  if (seeds.name !== srcName) { setSeeds((s) => ({ ...s, name: srcName })); setNameDraft(srcName); }
  if (seeds.northStar !== srcNorthStar) { setSeeds((s) => ({ ...s, northStar: srcNorthStar })); setNorthStarDraft(srcNorthStar); }
  if (seeds.url !== serverUrl) { setSeeds((s) => ({ ...s, url: serverUrl })); setUrlDraft(serverUrl); }
  if (seeds.token !== apiToken) { setSeeds((s) => ({ ...s, token: apiToken })); setTokenDraft(apiToken); }

  const saveLink = () =>
    void linkSave.run(async () => {
      setApiToken(tokenDraft);
      setServerUrl(urlDraft);
      await refresh();
    });

  const saveNameFlow = () => {
    if (!nameDraft.trim()) return;
    void nameSave.run(() => saveName(nameDraft.trim()));
  };

  const saveNorthStarFlow = () => void northStarSave.run(() => saveNorthStar(northStarDraft.trim()));

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
      <BackLink />
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
            disabled={northStarSave.state === 'saving'}
            style={({ pressed }) => [styles.btn, (pressed || northStarSave.state === 'saving') && { opacity: 0.8 }]}
            onPress={saveNorthStarFlow}
          >
            <Text style={styles.btnText}>{saveLabel(northStarSave.state, 'Save North Star')}</Text>
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
          disabled={linkSave.state === 'saving'}
          style={({ pressed }) => [styles.btn, (pressed || linkSave.state === 'saving') && { opacity: 0.8 }]}
          onPress={saveLink}
        >
          <Text style={styles.btnText}>
            {linkSave.state === 'saving'
              ? 'Reconnecting…'
              : linkSave.state === 'done'
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
          disabled={nameSave.state === 'saving'}
          style={({ pressed }) => [styles.btn, (pressed || nameSave.state === 'saving') && { opacity: 0.8 }]}
          onPress={saveNameFlow}
        >
          <Text style={styles.btnText}>{saveLabel(nameSave.state, 'Save')}</Text>
        </Pressable>
      </SystemPanel>

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
    color: onAccent,
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
