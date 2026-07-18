import { useState, type PropsWithChildren } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSystem } from '@/store/useSystem';
import { accent, surface } from '@/theme';

/** The app is phone-shaped, so on a wide browser we cap the content to a single
 * readable column and centre it — no edge-to-edge sprawl. */
export const CONTENT_MAX_WIDTH = 620;

/** Shared page: flat warm background, safe-area padding, pull-to-refresh, and a
 * centred max-width column so it reads well on phone and desktop alike. */
export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const refresh = useSystem((s) => s.refresh);
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.outer}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
      }
    >
      <View style={[styles.column, { paddingTop: insets.top + 20 }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: surface.base,
  },
  // Centres the column on wide screens; on a phone it just fills the width.
  outer: {
    alignItems: 'center',
  },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    padding: 18,
    paddingBottom: 100,
    gap: 16,
  },
});
