import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import type { ApiCaptureFailure, InsightKind } from '@/lib/api';
import { REASON_LABELS, describeAttempts, summariseSweep } from '@/lib/captures';
import { useFailedCaptures } from '@/query/useFailedCaptures';
import { TAP_MIN, accent, feedback, radius, surface, text, typography } from '@/theme';

function LinkRow({ url }: { url: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url).catch(() => {})}
      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
      hitSlop={4}
    >
      <Ionicons name="link-outline" size={13} color={text.faint} />
      <Text style={styles.linkText} numberOfLines={1}>
        {url}
      </Text>
    </Pressable>
  );
}

function FailedCard({
  item,
  busy,
  onRetry,
  onForget,
}: {
  item: ApiCaptureFailure;
  busy: boolean;
  onRetry: (id: string) => void;
  onForget: (id: string) => void;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Ionicons name="time-outline" size={15} color={feedback.gold} />
        <Text style={styles.title} numberOfLines={1}>
          {item.title || REASON_LABELS[item.reason]}
        </Text>
        <Text style={styles.attempts}>{describeAttempts(item.attempts)}</Text>
      </View>

      <LinkRow url={item.source_url} />
      <Text style={styles.detail}>{item.detail}</Text>

      <View style={styles.actions}>
        {item.retryable ? (
          <Button label="Distil now" tone="secondary" busy={busy} onPress={() => onRetry(item.id)} />
        ) : null}
        <Pressable
          onPress={() => onForget(item.id)}
          style={({ pressed }) => [styles.forget, pressed && { opacity: 0.6 }]}
          hitSlop={6}
        >
          <Ionicons name="trash-outline" size={14} color={text.secondary} />
          <Text style={styles.forgetText}>Forget</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * The links that were pasted but never distilled, kept on the server so a spent
 * quota or a key that wasn't set yet doesn't cost you the link (see
 * insights.CaptureFailure). Shown per capture mode, matching the panel above it.
 *
 * Renders nothing at all when there's nothing kept — this is a repair shelf, not a
 * permanent fixture of the tab.
 */
export function FailedCaptures({ kind }: { kind: InsightKind }) {
  const { failed, retry, retryingId, sweep, sweeping, lastSweep, forget } = useFailedCaptures();

  const isTips = kind === 'tips';
  const shown = failed.filter((f) => (isTips ? f.kind === 'tips' : f.kind !== 'tips'));
  if (shown.length === 0) return null;

  const retryable = shown.filter((f) => f.retryable).length;

  return (
    <SystemPanel title="Not distilled yet" badge={{ label: String(shown.length), tone: 'outline' }}>
      <Text style={styles.blurb}>
        These links are kept, not lost. Most of what stops a capture is temporary — a key that
        isn’t set, a day’s model quota — so try them again when it’s cleared.
      </Text>

      {retryable > 1 ? (
        <Button
          label={`Try ${retryable} again`}
          tone="secondary"
          block
          busy={sweeping}
          onPress={() => void sweep().catch(() => {})}
          style={styles.sweepBtn}
        />
      ) : null}

      {lastSweep ? <Text style={styles.sweepNote}>{summariseSweep(lastSweep)}</Text> : null}

      <View style={styles.list}>
        {shown.map((item) => (
          <FailedCard
            key={item.id}
            item={item}
            busy={retryingId === item.id || sweeping}
            onRetry={(id) => void retry(id).catch(() => {})}
            onForget={(id) => void forget(id)}
          />
        ))}
      </View>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  blurb: { ...typography.small, color: text.secondary, marginBottom: 14 },
  sweepBtn: { marginBottom: 10 },
  sweepNote: { ...typography.small, color: text.secondary, marginBottom: 12 },

  list: { gap: 12 },
  card: {
    backgroundColor: surface.muted,
    borderRadius: radius.md,
    padding: 15,
    gap: 9,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { ...typography.cardTitle, flex: 1 },
  attempts: { ...typography.small, color: text.faint },

  linkRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  linkText: { ...typography.small, color: accent, flex: 1 },
  detail: { ...typography.small, color: text.secondary, lineHeight: 18 },

  actions: { flexDirection: 'row', alignItems: 'center', gap: 14, flexWrap: 'wrap' },
  forget: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    minHeight: TAP_MIN,
    justifyContent: 'center',
  },
  forgetText: { color: text.secondary, fontSize: 12, fontWeight: '600' },
});
