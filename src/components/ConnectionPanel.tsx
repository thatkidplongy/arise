import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';

import { useSystem } from '@/store/useSystem';
import { accent, feedback, onAccent, text } from '@/theme';

import { SystemPanel } from './SystemPanel';

/** Shown when the app has no state yet — connecting, offline, or rejected. */
export function ConnectionPanel() {
  const status = useSystem((s) => s.status);
  const serverUrl = useSystem((s) => s.serverUrl);
  const refresh = useSystem((s) => s.refresh);

  const failed = status === 'offline' || status === 'unauthorized';

  return (
    <SystemPanel title="System link">
      {failed ? (
        <>
          <Text style={styles.heading}>
            {status === 'unauthorized' ? 'Access denied' : 'Connection lost'}
          </Text>
          {status === 'unauthorized' ? (
            <Text style={styles.line}>
              The server rejected your access token. Set the correct token under Settings → System
              link.
            </Text>
          ) : (
            <>
              <Text style={styles.line}>The System server is unreachable at</Text>
              <Text style={styles.url}>{serverUrl}</Text>
              <Text style={styles.line}>
                Make sure the backend is running, then retry. You can change the address in Settings.
              </Text>
            </>
          )}
          <Pressable
            style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}
            onPress={refresh}
          >
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator color={accent} />
          <Text style={[styles.line, styles.center]}>Connecting to the System…</Text>
        </>
      )}
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  heading: {
    color: feedback.danger,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  line: {
    color: text.secondary,
    fontSize: 13,
    lineHeight: 20,
  },
  center: {
    textAlign: 'center',
    marginTop: 8,
  },
  url: {
    fontSize: 13,
    fontWeight: '600',
    color: text.primary,
    marginVertical: 4,
  },
  retry: {
    marginTop: 16,
    backgroundColor: accent,
    borderRadius: 9,
    paddingVertical: 11,
    alignItems: 'center',
  },
  retryText: {
    color: onAccent,
    fontWeight: '700',
    fontSize: 14,
  },
});
