import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { GroceryPanel } from '@/components/GroceryPanel';
import { NutritionPanel } from '@/components/NutritionPanel';
import { Screen } from '@/components/Screen';
import { SkincarePanel } from '@/components/SkincarePanel';
import { useBody } from '@/query/useBody';
import { text } from '@/theme';

export default function BodyScreen() {
  const { body, refetch } = useBody();

  // Refetch whenever the tab comes into focus, so it's fresh without a manual pull.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <Screen>
      <View style={styles.head}>
        <Text style={styles.h1}>Body</Text>
        <Text style={styles.sub}>Take care of what carries you — gently.</Text>
      </View>
      {body ? (
        <>
          <NutritionPanel />
          <GroceryPanel />
          <SkincarePanel />
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
