import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { shared } from '@/components/Inspire/shared';
import { Text } from '@/components/ui/Text';
import { pendingTitle } from '@/lib/capture';
import type { PendingCapture } from '@/store/useCaptures';
import { TAP_MIN, accent, feedback, press, radius, surface, text, typography } from '@/theme';

export function PendingCard({
  item,
  onRetry,
  onDismiss,
}: {
  item: PendingCapture;
  onRetry: (tempId: string) => void;
  onDismiss: (tempId: string) => void;
}) {
  const working = item.status === 'working';
  return (
    <View style={[shared.card, styles.pendingCard]}>
      <View style={styles.cardHead}>
        {working ? (
          <ActivityIndicator size="small" color={accent} />
        ) : (
          <Ionicons name="alert-circle-outline" size={16} color={feedback.danger} />
        )}
        <Text style={styles.pendingTitle} numberOfLines={1}>
          {pendingTitle(working, item.kind)}
        </Text>
        {!working ? (
          <Pressable onPress={() => onDismiss(item.tempId)} hitSlop={8}>
            <Text style={styles.remove}>×</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.pendingUrl} numberOfLines={1}>
        {item.url}
      </Text>
      {!working && item.error ? <Text style={styles.error}>{item.error}</Text> : null}
      {!working ? (
        <Pressable
          onPress={() => onRetry(item.tempId)}
          style={({ pressed }) => [styles.retryBtn, pressed && { opacity: press.medium }]}
        >
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  remove: { color: text.faint, fontSize: 22, fontWeight: '700', marginTop: -4 },
  pendingCard: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: surface.edge,
  },
  pendingTitle: { ...typography.cardTitle, flex: 1 },
  pendingUrl: { ...typography.small, color: text.faint },
  retryBtn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    paddingVertical: 9,
    alignItems: 'center',
  },
  retryText: { color: accent, fontSize: 13, fontWeight: '700' },
  error: { color: feedback.danger, fontSize: 12, lineHeight: 17 },
});
