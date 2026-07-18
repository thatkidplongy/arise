import { useState, type PropsWithChildren } from 'react';
import { RefreshControl, ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSystem } from '@/store/useSystem';
import { accent, surface } from '@/theme';

/** Shared page: flat warm background, safe-area padding, pull-to-refresh. */
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
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 20 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
      }
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: surface.base,
  },
  content: {
    padding: 18,
    paddingBottom: 100,
    gap: 16,
  },
});
