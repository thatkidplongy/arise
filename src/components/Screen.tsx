import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSystem } from '@/store/useSystem';
import { accent, surface, text } from '@/theme';

/** The app is phone-shaped, so on a wide browser we cap the content to a single
 * readable column and centre it — no edge-to-edge sprawl. */
export const CONTENT_MAX_WIDTH = 620;

const PULL_THRESHOLD = 72; // px of drag before releasing triggers a reload

/** Web-only pull-to-reload. react-native-web's RefreshControl is a no-op, and an
 * installed PWA has no browser reload button — so we watch for a downward drag
 * from the very top of the scroller and hard-reload to pick up the latest build
 * (and fresh data). Native keeps the real RefreshControl below. */
function useWebPullToReload(scrollRef: React.RefObject<ScrollView | null>) {
  const [pull, setPull] = useState(0);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node: any = (scrollRef.current as any)?.getScrollableNode?.();
    if (!node?.addEventListener) return;

    let startY = 0;
    let active = false;

    const start = (e: any) => {
      if (node.scrollTop > 0) {
        active = false;
        return;
      }
      startY = e.touches[0].clientY;
      active = true;
    };
    const move = (e: any) => {
      if (!active) return;
      const dy = e.touches[0].clientY - startY;
      if (dy <= 0 || node.scrollTop > 0) {
        active = false;
        setPull(0);
        return;
      }
      setPull(Math.min(130, dy * 0.5)); // a little resistance
      if (e.cancelable) e.preventDefault(); // don't also rubber-band the page
    };
    const end = () => {
      if (!active) return;
      active = false;
      setPull((d) => {
        if (d >= PULL_THRESHOLD) {
          setReloading(true);
          const w: any = globalThis;
          w.setTimeout(() => w.location.reload(), 150); // let the spinner paint first
        }
        return 0;
      });
    };

    node.addEventListener('touchstart', start, { passive: true });
    node.addEventListener('touchmove', move, { passive: false });
    node.addEventListener('touchend', end, { passive: true });
    node.addEventListener('touchcancel', end, { passive: true });
    return () => {
      node.removeEventListener('touchstart', start);
      node.removeEventListener('touchmove', move);
      node.removeEventListener('touchend', end);
      node.removeEventListener('touchcancel', end);
    };
  }, [scrollRef]);

  return { pull, reloading };
}

/** Shared page: flat warm background, safe-area padding, pull-to-refresh, and a
 * centred max-width column so it reads well on phone and desktop alike. */
export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const refresh = useSystem((s) => s.refresh);
  const [refreshing, setRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { pull, reloading } = useWebPullToReload(scrollRef);
  const isWeb = Platform.OS === 'web';

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.root}
      contentContainerStyle={styles.outer}
      refreshControl={
        isWeb ? undefined : <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={accent} />
      }
    >
      {isWeb && (pull > 0 || reloading) ? (
        <View style={[styles.pull, { height: reloading ? 56 : pull }]}>
          {reloading ? (
            <View style={styles.pullRow}>
              <ActivityIndicator size="small" color={accent} />
              <Text style={styles.pullText}>Reloading…</Text>
            </View>
          ) : (
            <Text style={styles.pullText}>{pull >= PULL_THRESHOLD ? '↑  Release to reload' : '↓  Pull to reload'}</Text>
          )}
        </View>
      ) : null}
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
  pull: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  pullRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pullText: { color: text.faint, fontSize: 12, fontWeight: '600' },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    padding: 18,
    paddingBottom: 100,
    gap: 16,
  },
});
