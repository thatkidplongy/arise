import { StyleSheet, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Segmented } from '@/components/ui/Segmented';
import { Text } from '@/components/ui/Text';
import type { InsightKind } from '@/lib/api';
import { gateMessage } from '@/lib/capture';
import { text, typography } from '@/theme';

/** What each mode says about itself: where its links come from, what it does with
 * them, and what the field and button ask for. */
const MODES: Record<InsightKind, { sub: string; help: string; placeholder: string; action: string }> = {
  motivation: {
    sub: 'TikTok · Reels · YouTube',
    help: 'For something that moved you. Arise distils it into a few takeaways and quotes worth keeping — one resurfaces on your Status now and then.',
    placeholder: 'Paste a TikTok, Reel or YouTube link',
    action: 'Capture',
  },
  tips: {
    sub: 'TikTok · Reels · YouTube',
    help: 'For a how-to or advice video. Arise pulls out the practical steps worth keeping — and you can drop any step straight into your to-do list.',
    placeholder: 'Paste a TikTok, Reel or YouTube link',
    action: 'Capture tips',
  },
  tutorial: {
    sub: 'Long videos · articles · docs',
    help: 'For a full walkthrough — an hour-long video or a written guide. Arise pulls out its main points and the steps in order, ready to copy into another AI.',
    placeholder: 'Paste a YouTube link or an article URL',
    action: 'Capture tutorial',
  },
};

/** Paste a link and pick what to pull out of it. The modes are different asks of
 * the same link, so they sit on one control rather than as separate buttons. */
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
  const copy = MODES[mode];
  const gate = gateMessage(transcriptOn, llmOn);
  return (
    <SystemPanel title="Capture" sub={copy.sub}>
      <View style={styles.modeRow}>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'motivation', label: 'Motivation' },
            { value: 'tips', label: 'Tips' },
            { value: 'tutorial', label: 'Tutorial' },
          ]}
        />
      </View>
      <Text style={styles.help}>
        {copy.help} It runs in the background ({mode === 'tutorial' ? 'up to a few minutes' : '~8s'}), so
        you can paste another or leave this tab.
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
        placeholder={copy.placeholder}
      />
      <Button
        label={copy.action}
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
