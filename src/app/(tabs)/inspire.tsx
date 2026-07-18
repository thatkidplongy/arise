import { StyleSheet, Text, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { MotivationPanel } from '@/components/MotivationPanel';
import { Screen } from '@/components/Screen';
import { useSystem } from '@/store/useSystem';
import { text } from '@/theme';

export default function InspireScreen() {
  const state = useSystem((s) => s.state);

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.h1}>Inspire</Text>
        <Text style={styles.sub}>Turn what you watch into something you keep.</Text>
      </View>
      {state ? <MotivationPanel /> : <ConnectionPanel />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4, marginBottom: 2 },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  sub: { color: text.secondary, fontSize: 13 },
});
