import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Screen } from '@/components/Screen';
import { SkincarePanel } from '@/components/SkincarePanel';
import { useBody } from '@/query/useBody';
import { text } from '@/theme';

export default function SkincareScreen() {
  const { body, refetch } = useBody();

  // Refetch whenever the screen comes into focus, so it's fresh without a manual pull.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <Screen>
      <BackLink to="/you" />
      <View style={styles.head}>
        <Text style={styles.h1}>Skincare</Text>
        <Text style={styles.sub}>Your simple AM / PM routine — a small daily kindness.</Text>
      </View>
      {body ? <SkincarePanel /> : <ConnectionPanel />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4, marginBottom: 2 },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  sub: { color: text.secondary, fontSize: 13 },
});
