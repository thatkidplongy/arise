import { useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppUpdate } from '@/store/useAppUpdate';
import { useBody } from '@/store/useBody';
import { useSystem } from '@/store/useSystem';
import { accent, surface, text, withAlpha } from '@/theme';

/** The app is phone-shaped, so on a wide browser we cap the content to a single
 * readable column and centre it — no edge-to-edge sprawl. */
export const CONTENT_MAX_WIDTH = 620;

const PULL_THRESHOLD = 72; // px of drag before releasing triggers a refresh

/** Re-fetch the data the screens render, in place — no page reload, no flash.
 * Also quietly checks whether a newer build has shipped (surfaces the pill). */
async function softRefresh() {
  await Promise.all([useSystem.getState().refresh(), useBody.getState().fetch()]);
  void useAppUpdate.getState().check();
}

/** Web-only pull-to-refresh. react-native-web's RefreshControl is a no-op, so we
 * watch for a downward drag from the very top of the scroller and run a soft
 * refresh — matching the smooth native RefreshControl rather than reloading. */
function useWebPullToRefresh(scrollRef: React.RefObject<ScrollView | null>, onRefresh: () => Promise<void>) {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const cb = useRef(onRefresh);
  cb.current = onRefresh;
  const busy = useRef(false);

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

/** Shared page: flat warm background, safe-area padding, a smooth pull-to-refresh,
 * and an unobtrusive "update available" bar when a newer build has shipped. */
export function Screen({ children }: PropsWithChildren) {
  const insets = useSafeAreaInsets();
  const [nativeRefreshing, setNativeRefreshing] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const { pull, refreshing } = useWebPullToRefresh(scrollRef, softRefresh);
  const updateAvailable = useAppUpdate((s) => s.available);
  const reload = useAppUpdate((s) => s.reload);
  const isWeb = Platform.OS === 'web';

  const onNativeRefresh = async () => {
    setNativeRefreshing(true);
    await softRefresh();
    setNativeRefreshing(false);
  };

  return (
    <View style={styles.root}>
      {updateAvailable ? (
        <Pressable
          onPress={reload}
          style={({ pressed }) => [styles.updateBar, { paddingTop: insets.top + 9 }, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.updateText}>A new version is ready — tap to update</Text>
        </Pressable>
      ) : null}
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
        <View style={[styles.column, { paddingTop: (updateAvailable ? 20 : insets.top + 20) }]}>{children}</View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: surface.base,
  },
  updateBar: {
    width: '100%',
    alignItems: 'center',
    paddingBottom: 9,
    paddingHorizontal: 16,
    backgroundColor: withAlpha(accent, 0.16),
    borderBottomWidth: 1,
    borderBottomColor: withAlpha(accent, 0.35),
  },
  updateText: { color: accent, fontSize: 13, fontWeight: '700' },
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
