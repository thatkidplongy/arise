import { StyleSheet, Text, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { FocusAreasCard } from '@/components/FocusAreasCard';
import { InterviewModeCard } from '@/components/InterviewModeCard';
import { Screen } from '@/components/Screen';
import { useSystem } from '@/store/useSystem';
import { text } from '@/theme';

export default function FocusScreen() {
  const state = useSystem((s) => s.state);

  return (
    <Screen>
      <BackLink />
      <View style={styles.head}>
        <Text style={styles.h1}>Focus</Text>
        <Text style={styles.sub}>Shape how the System tailors your quests.</Text>
      </View>
      {state ? (
        <>
          <FocusAreasCard />
          <InterviewModeCard />
        </>
      ) : (
        <ConnectionPanel />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4, marginBottom: 2 },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  sub: { color: text.secondary, fontSize: 13 },
});
