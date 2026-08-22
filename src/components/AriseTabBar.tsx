import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CONTENT_MAX_WIDTH } from "@/components/Screen";
import { Text } from "@/components/ui/Text";
import { RAIL_WIDTH, useWide } from "@/hooks/useWide";
import { useSystem } from "@/store/useSystem";
import { clay, neutral, radius, sage, shadow, surface, text, typography, withAlpha } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

/** Icon per visible tab — outline when idle, filled when active. Keyed by route
 * name so the tab bar owns its glyphs (the screens only set their title). */
const ICONS: Record<string, { on: IconName; off: IconName }> = {
  index: { on: "person", off: "person-outline" },
  quests: { on: "flash", off: "flash-outline" },
  learn: { on: "bulb", off: "bulb-outline" },
  inspire: { on: "flame", off: "flame-outline" },
  you: { on: "person-circle", off: "person-circle-outline" },
  // Off the bar for now, but a glyph costs nothing and the route still works.
  body: { on: "nutrition", off: "nutrition-outline" },
};
const FALLBACK_GLYPH = { on: "ellipse", off: "ellipse-outline" } as const;

const PILL_W = 54;
const PILL_H = 42;
const BAR_H = 62; // the floating bar itself; the safe-area inset sits under it
const SIDE_PAD = 16; // gap between the bar and the screen edges
const LIFT = 10; // gap between the bar and the safe-area inset below it

/**
 * The glass, in two parts.
 *
 * `GLASS_SOLID` is what the bar is without a blur behind it — opaque enough to read
 * icons against whatever scrolls under it. The injected stylesheet in
 * scripts/build-web.sh drops it to `.62` and adds the blur, but only inside an
 * `@supports` check, so a browser that can't blur keeps the readable version rather
 * than a muddy translucent one.
 *
 * expo-glass-effect is in package.json and would be the native answer, but its
 * non-iOS GlassView is `<View {...props} />` and isLiquidGlassAvailable() returns
 * false — on the web build this ships as, it draws nothing at all.
 */
const GLASS_SOLID = withAlpha(surface.card, 0.86);
const GLASS_RIM = withAlpha(neutral[900], 0.12);
/**
 * The specular edge — a bright hairline along the top inside lip.
 *
 * This, not the blur, is what makes a surface read as glass. A blur only shows where
 * there's detail behind it to smear, and most of this app is flat sand: the bar was
 * genuinely blurring and still looked like plain translucent plastic. A lit top edge
 * reads as thickness and catches the eye even over an empty background.
 */
const GLASS_SHEEN = 'rgba(255, 255, 255, 0.65)'; // white, deliberately off-ramp: a
// specular highlight is light itself rather than any surface in the palette.
/** Shared with the backdrop-filter rule in scripts/build-web.sh. */
const GLASS_ID = 'arise-glass-bar';

// A snappy spring carries the pill; a looser, slower one carries the shadow, so it
// lags behind mid-slide. The shadow then fades out over SHADOW_FADE_MS.
const PILL_SPRING = {
  stiffness: 280,
  damping: 26,
  mass: 1,
  useNativeDriver: false,
} as const;
const SHADOW_SPRING = {
  stiffness: 110,
  damping: 16,
  mass: 1,
  useNativeDriver: false,
} as const;
const SHADOW_FADE_MS = 380;
const FADE_MS = 180;

type Route = { key: string; name: string };
type Options = {
  title?: string;
  tabBarButton?: unknown;
  tabBarItemStyle?: unknown;
};
type TabBarProps = {
  state: { index: number; routes: Route[] };
  descriptors: Record<string, { options: Options }>;
  navigation: {
    navigate: (name: string) => void;
    emit: (e: {
      type: "tabPress";
      target: string;
      canPreventDefault: true;
    }) => { defaultPrevented: boolean };
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
  const wide = useWide();
  const [rowW, setRowW] = useState(0);

  // Expo Router hides `href: null` routes with a null tabBarButton + display:none;
  // keep only the real destinations, in order.
  const visible = useMemo(
    () =>
      state.routes.filter((r) => {
        const o = descriptors[r.key]?.options;
        const itemStyle = o?.tabBarItemStyle as
          | { display?: string }
          | undefined;
        return !(
          typeof o?.tabBarButton === "function" || itemStyle?.display === "none"
        );
      }),
    [state.routes, descriptors]
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
      Animated.timing(pillOpacity, {
        toValue: 0,
        duration: FADE_MS,
        useNativeDriver: false,
      }).start();
      return;
    }
    if (!ready.current) {
      // First real layout — place the pill without a slide-in from the corner.
      mainX.setValue(activeIndex);
      shadowX.setValue(activeIndex);
      ready.current = true;
    } else {
      Animated.spring(mainX, { toValue: activeIndex, ...PILL_SPRING }).start();
      Animated.spring(shadowX, {
        toValue: activeIndex,
        ...SHADOW_SPRING,
      }).start();
      // Reveal the trailing shadow for the slide, then fade it back under the pill.
      shadowVis.setValue(1);
      Animated.timing(shadowVis, {
        toValue: 0,
        duration: SHADOW_FADE_MS,
        useNativeDriver: false,
      }).start();
    }
    Animated.timing(pillOpacity, {
      toValue: 1,
      duration: FADE_MS,
      useNativeDriver: false,
    }).start();
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
    const event = navigation.emit({
      type: "tabPress",
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
  };

  if (wide) {
    return (
      <Rail
        visible={visible}
        activeIndex={activeIndex}
        descriptors={descriptors}
        onPress={onPress}
      />
    );
  }

  return (
    // box-none: the dock spans the screen so the bar can be centred in it, but only
    // the bar itself may take a touch — otherwise it would swallow taps on the page.
    <View style={[styles.dock, { paddingBottom: insets.bottom + LIFT }]} pointerEvents="box-none">
      <View
        style={styles.bar}
        // react-native-web renders nativeID as the DOM id, which is how the injected
        // stylesheet finds this one view to blur. Ignored on native.
        nativeID={GLASS_ID}
        onLayout={(e) => setRowW(e.nativeEvent.layout.width)}
      >
        {/* Above the sliding pill so the lip stays lit as the pill passes under it. */}
        <View pointerEvents="none" style={styles.sheen} />
        <Animated.View
          style={[
            styles.pill,
            styles.shadowTint,
            {
              opacity: shadowVis,
              transform: [{ translateX: slideFor(shadowX) }],
            },
          ]}
        />
        <Animated.View
          style={[
            styles.pill,
            styles.mainTint,
            {
              opacity: pillOpacity,
              transform: [{ translateX: slideFor(mainX) }],
            },
          ]}
        />
        {visible.map((route, i) => {
          const focused = i === activeIndex;
          const color = focused ? clay[700] : neutral[600];
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
              <Ionicons
                name={focused ? glyph.on : glyph.off}
                size={25}
                color={color}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * The desktop shape of the bar. Nothing new is added — the same five destinations,
 * unstacked into a column that never scrolls away, with the wordmark above them and
 * who you are at the foot.
 */
function Rail({
  visible,
  activeIndex,
  descriptors,
  onPress,
}: {
  visible: Route[];
  activeIndex: number;
  descriptors: TabBarProps["descriptors"];
  onPress: (route: Route, focused: boolean) => void;
}) {
  const player = useSystem((s) => s.state?.player);
  return (
    <View style={styles.rail}>
      <View style={styles.railHead}>
        <Text style={styles.railMark}>Arise</Text>
        <Text style={styles.railTag}>rise beyond your limits</Text>
      </View>

      <View style={styles.railNav}>
        {visible.map((route, i) => {
          const focused = i === activeIndex;
          const glyph = ICONS[route.name] ?? FALLBACK_GLYPH;
          const title = descriptors[route.key]?.options.title ?? route.name;
          return (
            <Pressable
              key={route.key}
              onPress={() => onPress(route, focused)}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              style={({ pressed }) => [
                styles.railItem,
                focused ? styles.railItemOn : null,
                pressed && !focused ? styles.railItemPressed : null,
              ]}
            >
              <Ionicons
                name={focused ? glyph.on : glyph.off}
                size={20}
                color={focused ? clay[700] : neutral[600]}
              />
              <Text style={[styles.railLabel, { color: focused ? clay[700] : neutral[700] }]}>
                {title}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {player ? (
        <View style={styles.railFoot}>
          <View style={styles.railWho}>
            <View style={styles.railAvatar}>
              <Text style={styles.railInitial}>{player.name.slice(0, 1).toUpperCase()}</Text>
            </View>
            <View style={styles.railWhoCopy}>
              <Text style={styles.railName} numberOfLines={1}>
                {player.name}
              </Text>
              <Text style={styles.railMeta}>
                Lv {player.level} · {player.rank}-Rank
              </Text>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: RAIL_WIDTH,
    paddingVertical: 24,
    paddingHorizontal: 16,
    gap: 22,
    borderRightWidth: 1,
    borderRightColor: surface.hairline,
    backgroundColor: surface.base,
    zIndex: 5,
  },
  railHead: { paddingLeft: 8, gap: 3 },
  railMark: { ...typography.numeral, fontSize: 26, color: clay[700], includeFontPadding: false },
  railTag: { ...typography.small, fontSize: 11, color: text.secondary },
  railNav: { gap: 4 },
  railItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
  },
  railItemOn: { backgroundColor: clay[200] },
  railItemPressed: { backgroundColor: neutral[200] },
  railLabel: { ...typography.label, fontSize: 13.5 },
  railFoot: { marginTop: "auto", gap: 12 },
  railWho: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: surface.card,
  },
  railAvatar: {
    width: 38,
    height: 38,
    borderRadius: radius.pill,
    backgroundColor: sage[300],
    alignItems: "center",
    justifyContent: "center",
  },
  railInitial: { ...typography.numeral, fontSize: 15, color: sage[800], includeFontPadding: false },
  railWhoCopy: { flex: 1, minWidth: 0, gap: 1 },
  railName: { ...typography.cardTitle, fontSize: 12.5, color: neutral[900] },
  railMeta: { ...typography.tiny, color: text.secondary },
  // Floats over the page rather than sitting under it, so the blur has something to
  // blur. Absolute, so it contributes no layout height — Screen's own paddingBottom
  // is what keeps the last row of content clear of it.
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIDE_PAD,
    alignItems: "center",
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    position: "relative",
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    height: BAR_H,
    borderRadius: radius.pill,
    backgroundColor: GLASS_SOLID,
    borderWidth: 1,
    borderColor: GLASS_RIM,
    // Clips the sliding pill to the rounded ends at the extremes of its travel.
    overflow: "hidden",
    ...shadow.lg,
  },
  sheen: {
    position: "absolute",
    zIndex: 2,
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: GLASS_SHEEN,
  },
  tab: {
    flex: 1,
    zIndex: 1,
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
  },
  pill: {
    position: "absolute",
    zIndex: 0,
    left: 0,
    top: (BAR_H - PILL_H) / 2,
    width: PILL_W,
    height: PILL_H,
    borderRadius: radius.pill,
  },
  mainTint: { backgroundColor: clay[200] },
  shadowTint: { backgroundColor: withAlpha(text.primary, 0.12) },
});
