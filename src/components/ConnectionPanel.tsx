import { type Href } from 'expo-router';
import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, font, neutral, text, typography } from '@/theme';

import { BackLink } from './BackLink';
import { Screen } from './Screen';
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

/**
 * A whole screen, for before there is any state to draw.
 *
 * Seven screens each guarded themselves with the same `if (!state) return` — and
 * quietly drifted while doing it: three offered a way back to the You hub, three
 * offered none, and one went somewhere else entirely. Which of those a screen
 * should do is a question about that screen, so it stays a prop; spelling the
 * wrapper out seven times is not, so it doesn't.
 *
 * `head` is for the one screen that shows something above the panel (Status keeps
 * its masthead, so the app doesn't look like it lost its name while connecting).
 */
export function NotConnected({ back, head }: { back?: Href; head?: ReactNode }) {
  return (
    <Screen>
      {head}
      {back ? <BackLink to={back} /> : null}
      <ConnectionPanel />
    </Screen>
  );
}

const styles = StyleSheet.create({
  heading: { ...typography.heading, color: feedback.danger, marginBottom: 8 },
  line: { ...typography.body, color: text.secondary },
  center: { textAlign: 'center', marginTop: 10 },
  url: { ...typography.mono, color: neutral[900], fontFamily: font.mono, marginVertical: 6 },
  retry: { marginTop: 18 },
});
