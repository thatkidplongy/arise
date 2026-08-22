import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/Text';
import { queryClient } from '@/query/client';
import { useSystem } from '@/store/useSystem';
import { accent, surface, text, typography } from '@/theme';

/** The app is phone-shaped, so on a wide browser we cap the content to a single
 * readable column and centre it — no edge-to-edge sprawl. */
export const CONTENT_MAX_WIDTH = 620;

const PULL_THRESHOLD = 72; // px of drag before releasing triggers a refresh

/** Re-fetch the data the screens render, in place — no page reload, no flash.
 * The core state lives in useSystem; the Body tab's data is a React Query, so we
 * invalidate it (refetches wherever it's mounted). */
async function softRefresh() {
  await Promise.all([
    useSystem.getState().refresh(),
    queryClient.invalidateQueries({ queryKey: ['body'] }),
  ]);
}

/** Web-only pull-to-refresh. react-native-web's RefreshControl is a no-op, so we
 * watch for a downward drag from the very top of the scroller and run a soft
 * refresh — matching the smooth native RefreshControl rather than reloading. */
function useWebPullToRefresh(scrollRef: React.RefObject<ScrollView | null>, onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  const busy = useRef(false);

  // Synced in an effect rather than during render. The touch listeners below are
  // attached once and read the callback back through this ref, so it has to stay
  // current without re-running the attach effect on every render.
  useEffect(() => {
    cb.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const node: any = (scrollRef.current as any)?.getScrollableNode?.();
    if (!node?.addEventListener) return;

    let startY = 0;
    let active = false;

    const start = (e: any) => {
      if (node.scrollTop > 0 || busy.current) {
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
      setPull(Math.min(120, dy * 0.5)); // a little resistance
      if (e.cancelable) e.preventDefault(); // don't also rubber-band the page
    };
    const end = () => {
      if (!active) return;
      active = false;
      setPull((d) => {
        if (d >= PULL_THRESHOLD && !busy.current) {
          busy.current = true;
          setRefreshing(true);
          Promise.resolve(cb.current()).finally(() => {
            busy.current = false;
            setRefreshing(false);
          });
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

  return { pull, refreshing };
}

/** Shared page: flat warm background, safe-area padding, and a smooth
 * pull-to-refresh that re-fetches data in place (no page reload). */
export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const [nativeRefreshing, setNativeRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { pull, refreshing } = useWebPullToRefresh(scrollRef, softRefresh);
  const isWeb = Platform.OS === 'web';

  const onNativeRefresh = async () => {
    setNativeRefreshing(true);
    await softRefresh();
    setNativeRefreshing(false);
  };

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.root}
      contentContainerStyle={styles.outer}
      refreshControl={
        isWeb ? undefined : <RefreshControl refreshing={nativeRefreshing} onRefresh={onNativeRefresh} tintColor={accent} />
      }
    >
      {isWeb && (pull > 0 || refreshing) ? (
        <View style={[styles.pull, { height: refreshing ? 52 : pull }]}>
          {refreshing ? (
            <View style={styles.pullRow}>
              <ActivityIndicator size="small" color={accent} />
              <Text style={styles.pullText}>Refreshing…</Text>
            </View>
          ) : (
            <Text style={styles.pullText}>{pull >= PULL_THRESHOLD ? '↑  Release to refresh' : '↓  Pull to refresh'}</Text>
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
  pullText: { ...typography.label, fontSize: 12, color: text.secondary },
  column: {
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    padding: 18,
    paddingBottom: 112,
    gap: 16,
  },
});
