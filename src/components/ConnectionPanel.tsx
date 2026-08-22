import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, font, neutral, text, typography } from '@/theme';

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
          <Button label="Retry" onPress={refresh} block style={styles.retry} />
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
  heading: { ...typography.heading, color: feedback.danger, marginBottom: 8 },
  line: { ...typography.body, color: text.secondary },
  center: { textAlign: 'center', marginTop: 10 },
  url: { ...typography.mono, color: neutral[900], fontFamily: font.mono, marginVertical: 6 },
  retry: { marginTop: 18 },
});
