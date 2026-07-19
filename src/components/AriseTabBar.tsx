import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTENT_MAX_WIDTH } from '@/components/Screen';
import { accent, surface, text, withAlpha } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/** Icon per visible tab — outline when idle, filled when active. Keyed by route
 * name so the tab bar owns its glyphs (the screens only set their title). */
const ICONS: Record<string, { on: IconName; off: IconName }> = {
  index: { on: 'person', off: 'person-outline' },
  quests: { on: 'flash', off: 'flash-outline' },
  body: { on: 'body', off: 'body-outline' },
  inspire: { on: 'flame', off: 'flame-outline' },
  you: { on: 'person-circle', off: 'person-circle-outline' },
};
const FALLBACK_GLYPH = { on: 'ellipse', off: 'ellipse-outline' } as const;

const PILL_W = 56;
const PILL_H = 36;
const PILL_TOP = 2;
const BAR_CONTENT_H = 74; // bar height above the safe-area inset
const EDGE_PAD = 8;

// A snappy spring carries the pill; a looser, slower one carries the shadow, so it
// lags behind mid-slide. The shadow then fades out over SHADOW_FADE_MS.
const PILL_SPRING = { stiffness: 280, damping: 26, mass: 1, useNativeDriver: false } as const;
const SHADOW_SPRING = { stiffness: 110, damping: 16, mass: 1, useNativeDriver: false } as const;
const SHADOW_FADE_MS = 380;
const FADE_MS = 180;

type Route = { key: string; name: string };
type Options = { title?: string; tabBarButton?: unknown; tabBarItemStyle?: unknown };
type TabBarProps = {
  state: { index: number; routes: Route[] };
  descriptors: Record<string, { options: Options }>;
  navigation: {
    navigate: (name: string) => void;
    emit: (e: { type: 'tabPress'; target: string; canPreventDefault: true }) => { defaultPrevented: boolean };
  };
};

/**
 * Custom bottom bar with a sliding clay pill behind the active tab. Two indicators
 * move together: a crisp pill on a snappy spring, and a softer shadow on a looser,
 * slower one — so during a switch the shadow lags behind, smearing from the tab you
 * left toward the one you're heading to (a shadow cast in the direction of travel),
 * then fades, leaving just the pill at rest.
 */
export function AriseTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();
  const [rowW, setRowW] = useState(0);

  // Expo Router hides `href: null` routes with a null tabBarButton + display:none;
  // keep only the real destinations, in order.
  const visible = useMemo(
    () =>
      state.routes.filter((r) => {
        const o = descriptors[r.key]?.options;
        const itemStyle = o?.tabBarItemStyle as { display?: string } | undefined;
        return !(typeof o?.tabBarButton === 'function' || itemStyle?.display === 'none');
      }),
    [state.routes, descriptors],
  );

  const count = visible.length;
  const activeName = state.routes[state.index]?.name;
  const activeIndex = visible.findIndex((r) => r.name === activeName);
  const onScreen = activeIndex >= 0; // false while on a hidden screen (Settings, etc.)
  const tabW = count > 0 ? rowW / count : 0;

  // Lazy-init so each Animated.Value is created once and stays stable across renders.
  const [mainX] = useState(() => new Animated.Value(0));
  const [shadowX] = useState(() => new Animated.Value(0));
  const [pillOpacity] = useState(() => new Animated.Value(0));
  const [shadowVis] = useState(() => new Animated.Value(0)); // shadow shows only while moving
  const ready = useRef(false);

  useEffect(() => {
    if (tabW <= 0) return;
    if (!onScreen) {
      Animated.timing(pillOpacity, { toValue: 0, duration: FADE_MS, useNativeDriver: false }).start();
      return;
    }
    if (!ready.current) {
      // First real layout — place the pill without a slide-in from the corner.
      mainX.setValue(activeIndex);
      shadowX.setValue(activeIndex);
      ready.current = true;
    } else {
      Animated.spring(mainX, { toValue: activeIndex, ...PILL_SPRING }).start();
      Animated.spring(shadowX, { toValue: activeIndex, ...SHADOW_SPRING }).start();
      // Reveal the trailing shadow for the slide, then fade it back under the pill.
      shadowVis.setValue(1);
      Animated.timing(shadowVis, { toValue: 0, duration: SHADOW_FADE_MS, useNativeDriver: false }).start();
    }
    Animated.timing(pillOpacity, { toValue: 1, duration: FADE_MS, useNativeDriver: false }).start();
  }, [activeIndex, onScreen, tabW, mainX, shadowX, pillOpacity, shadowVis]);

  // Map the active-index animated value to the pill's x-offset within the row.
  const slideFor = (v: Animated.Value) =>
    count > 1 && tabW > 0
      ? v.interpolate({
          inputRange: visible.map((_, i) => i),
          outputRange: visible.map((_, i) => i * tabW + (tabW - PILL_W) / 2),
        })
      : 0;

  const onPress = (route: Route, focused: boolean) => {
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  return (
    <View style={styles.strip}>
      <View
        style={[styles.row, { paddingBottom: insets.bottom + EDGE_PAD, height: BAR_CONTENT_H + insets.bottom }]}
        onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
      >
        <Animated.View
          style={[styles.pill, styles.shadowTint, { opacity: shadowVis, transform: [{ translateX: slideFor(shadowX) }] }]}
        />
        <Animated.View
          style={[styles.pill, styles.mainTint, { opacity: pillOpacity, transform: [{ translateX: slideFor(mainX) }] }]}
        />
        {visible.map((route, i) => {
          const focused = i === activeIndex;
          const color = focused ? accent : text.faint;
          const glyph = ICONS[route.name] ?? FALLBACK_GLYPH;
          const title = descriptors[route.key]?.options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              style={styles.tab}
              onPress={() => onPress(route, focused)}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={title}
            >
              <Ionicons name={focused ? glyph.on : glyph.off} size={24} color={color} />
              <Text style={[styles.label, { color }]} numberOfLines={1}>
                {title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    backgroundColor: surface.card,
    borderTopWidth: 1,
    borderTopColor: surface.hairline,
  },
  row: {
    flexDirection: 'row',
    position: 'relative',
    width: '100%',
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: 'center',
    paddingTop: EDGE_PAD,
  },
  tab: {
    flex: 1,
    zIndex: 1,
    alignItems: 'center',
    gap: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '600',
    lineHeight: 16,
  },
  pill: {
    position: 'absolute',
    zIndex: 0,
    left: 0,
    top: PILL_TOP,
    width: PILL_W,
    height: PILL_H,
    borderRadius: 999,
  },
  mainTint: { backgroundColor: withAlpha(accent, 0.15) },
  shadowTint: { backgroundColor: withAlpha(text.primary, 0.16) },
});
