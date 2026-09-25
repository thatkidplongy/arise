import { StyleSheet, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import type { InsightKind } from '@/lib/api';
import { gateMessage } from '@/lib/capture';
import { text, typography } from '@/theme';

/** Paste a link and pick what to pull out of it. The two modes are two different
 * asks of the same video, so they sit on one control rather than two buttons. */
export function CaptureCard({
  url,
  setUrl,
  mode,
  setMode,
  transcriptOn,
  llmOn,
  canCapture,
  statusMsg,
  onCapture,
}: {
  url: string;
  setUrl: (v: string) => void;
  mode: InsightKind;
  setMode: (m: InsightKind) => void;
  transcriptOn: boolean;
  llmOn: boolean;
  canCapture: boolean;
  statusMsg: string | null;
  onCapture: () => void;
}) {
  const tips = mode === 'tips';
  const gate = gateMessage(transcriptOn, llmOn);
  return (
    <SystemPanel title="Capture" sub="TikTok · Reels · YouTube">
      <View style={styles.modeRow}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'motivation', label: 'Motivation' },
            { value: 'tips', label: 'Tips' },
          ]}
        />
      </View>
      <Text style={styles.help}>
        {tips
          ? 'For a how-to or advice video. Arise pulls out the practical steps worth keeping — and you can drop any step straight into your to-do list.'
          : 'For something that moved you. Arise distils it into a few takeaways and quotes worth keeping — one resurfaces on your Status now and then.'}
        {' '}It runs in the background (~8s), so you can paste another or leave this tab.
      </Text>
      <Field
        value={url}
        onChangeText={setUrl}
        onSubmitEditing={onCapture}
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        placeholder="Paste a TikTok, Reel or YouTube link"
      />
      <Button
        label={tips ? 'Capture tips' : 'Capture'}
        onPress={onCapture}
        disabled={!canCapture}
        block
        large
      />
      {gate ? <Text style={styles.gate}>{gate}</Text> : null}
      {statusMsg ? <Text style={styles.hint}>{statusMsg}</Text> : null}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  help: { ...typography.small, color: text.secondary, marginBottom: 14 },
  modeRow: { marginBottom: 14 },
  input: { marginBottom: 12 },
  gate: { color: text.faint, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  hint: { color: text.faint, fontSize: 12, lineHeight: 17, marginTop: 10 },
});
