import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { Card, ScreenTitle } from '@/components/ui/Card';
import { Field, TextArea } from '@/components/ui/Field';
import { Text } from '@/components/ui/Text';
import { saveLabel, useSaveState } from '@/hooks/useSaveState';
import { useSystem } from '@/store/useSystem';
import { feedback, neutral, radius, text, typography } from '@/theme';

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
      <ScreenTitle>Settings</ScreenTitle>

      {state ? (
        <SystemPanel title="Your North Star">
          <Text style={styles.help}>
            The life you’re reaching for, in your own words — who you want to be, why you’re doing
            this. It stays at the top of your Status as a reminder. No wrong answer.
          </Text>
          <TextArea
            value={northStarDraft}
            onChangeText={setNorthStarDraft}
            style={styles.field}
            placeholder="e.g. Someone I’m proud to see in the mirror — strong, creative, present, still growing."
            maxLength={280}
          />
          <Button
            label={saveLabel(northStarSave.state, 'Save North Star')}
            busy={northStarSave.state === 'saving'}
            onPress={saveNorthStarFlow}
            block
          />
        </SystemPanel>
      ) : null}

      <SystemPanel title="System link" sub={status}>
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: statusColor }]} />
          <Text style={styles.line}>{statusMessage}</Text>
        </View>
        <Field
          value={urlDraft}
          onChangeText={setUrlDraft}
          style={styles.field}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://yourhunter.duckdns.org"
        />
        <Field
          value={tokenDraft}
          onChangeText={setTokenDraft}
          style={styles.field}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
          placeholder="Access token (leave blank for local)"
        />
        <Button
          label={
            linkSave.state === 'saving'
              ? 'Reconnecting…'
              : linkSave.state === 'done'
                ? 'Reconnected'
                : 'Save and reconnect'
          }
          busy={linkSave.state === 'saving'}
          onPress={saveLink}
          block
        />
      </SystemPanel>

      <SystemPanel title="Hunter name">
        <Field
          value={nameDraft}
          onChangeText={setNameDraft}
          style={styles.field}
          placeholder="Enter hunter name"
          maxLength={24}
        />
        <Button
          label={saveLabel(nameSave.state, 'Save')}
          busy={nameSave.state === 'saving'}
          onPress={saveNameFlow}
          block
        />
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

      <Card tone="dashed" style={styles.danger}>
        <Text style={styles.dangerTitle}>Starting over</Text>
        <Text style={styles.help}>
          This erases every quest, reflection and streak. There is no undo, and nothing here needs
          it — a quiet week is not a reason to reset.
        </Text>
        <Button
          label={
            resetting ? 'Resetting…' : confirmReset ? 'Tap again to erase all progress' : 'Reset all data'
          }
          tone="danger"
          busy={resetting}
          block
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
        />
        {confirmReset && !resetting ? (
          <Button label="Cancel" tone="ghost" block onPress={() => setConfirmReset(false)} />
        ) : null}
      </Card>

      <Text style={styles.footer}>Arise · a personal System, inspired by Solo Leveling</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: radius.pill,
  },
  field: { marginBottom: 10 },
  line: { ...typography.body, color: text.secondary, flex: 1 },
  help: { ...typography.small, color: text.secondary, marginBottom: 12 },
  recordLine: { ...typography.body, lineHeight: 24, color: neutral[900] },
  danger: { gap: 10 },
  dangerTitle: { ...typography.heading, color: feedback.danger },
  footer: { ...typography.small, color: text.faint, textAlign: 'center', marginTop: 8 },
});
