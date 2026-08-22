import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useSystem } from '@/store/useSystem';
import { TAP_MIN, accent, clay, motion, neutral, radius, shadow, surface, text, typography } from '@/theme';
import type { Toast as ToastData } from '@/types';

/** How long a toast lingers before auto-dismissing. The bottom bar drains over
 * exactly this span, so the two always stay in sync. */
const TOAST_MS = motion.undoWindow;

/**
 * A transient floating confirmation, anchored above the tab bar. Shown whenever a
 * quest reaches done — tapping its check circle or ticking its last step — so a
 * save that worked always says so, with a quick undo before it fades on its own. A
 * thin bar along the bottom drains as the auto-dismiss timer runs down, so you can
 * see how long you've got to hit Undo.
 *
 * Light, like the rest of the page. It reads as a sheet lifted off the cards rather
 * than the System cutting in, and the drop shadow — not a change of palette — is what
 * separates it. Ink is rationed to at most two windows a screen, and a five-second
 * confirmation is a poor use of that budget; the Card 'ink' tone keeps it instead.
 */
export function ToastHost() {
  const toast = useSystem((s) => s.toast);
  if (!toast) return null;
  // Keyed on the id so each new toast is a fresh mount: its countdown starts full
  // without an effect having to reach back and reset it.
  return <ToastView key={toast.id} toast={toast} />;
}

/**
 * One toast, alive for TOAST_MS.
 *
 * The card itself carries no animation on purpose. An Animated.Value bound to its
 * `opacity` never reached the DOM node on this RN Web build: the toast mounted at 0
 * and sat there invisible, so a completion that saved perfectly looked like it had
 * done nothing. A confirmation must never depend on an animation landing.
 *
 * The countdown bar is the exception, and it does have to animate — driving it from
 * interval state meant fifty visible steps across five seconds. It uses XpBar's
 * shape (an Animated width, no native driver), which is the one Animated usage on
 * this build known to drive. If it ever stops driving, the bar sits full while the
 * toast still shows and still undoes.
 */
function ToastView({ toast }: { toast: ToastData }) {
  const undoToast = useSystem((s) => s.undoToast);
  const dismiss = useSystem((s) => s.dismissToast);
  // Share of the toast's life remaining, 1 → 0. State, not a ref: the width style is
  // built during render, which a ref forbids.
  const [left] = useState(() => new Animated.Value(1));

  useEffect(() => {
    const drain = Animated.timing(left, {
      toValue: 0,
      duration: TOAST_MS,
      // Linear, not the default ease: a countdown that slowed down at the end would
      // misreport how long is left to hit Undo.
      easing: Easing.linear,
      useNativeDriver: false,
    });
    drain.start();
    const timer = setTimeout(() => dismiss(), TOAST_MS);
    return () => {
      drain.stop(); // an Undo mid-drain shouldn't leave it animating
      clearTimeout(timer);
    };
  }, [left, dismiss]);

  const width = left.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View style={styles.toast}>
        <View style={styles.msg}>
          <Text style={styles.title} numberOfLines={1}>
            {toast.title}
          </Text>
          <Text style={styles.sub}>+{toast.xp} XP</Text>
        </View>
        <Pressable
          onPress={undoToast}
          hitSlop={10}
          style={({ pressed }) => [styles.undo, pressed && { backgroundColor: clay[100] }]}
        >
          <Text style={styles.undoText}>Undo</Text>
        </Pressable>
        <Animated.View pointerEvents="none" style={[styles.countdown, { width }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 108,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 90,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    width: '100%',
    maxWidth: 420,
    // Ivory on sand is 1.09:1 — the same as every card in the app, which is fine for
    // something sitting *in* the page. This floats over one, so the shadow is what
    // marks it as lifted rather than part of what's underneath.
    backgroundColor: surface.card,
    borderRadius: 22,
    paddingTop: 15,
    paddingBottom: 16,
    paddingHorizontal: 16,
    // clip the countdown bar to the rounded corners
    overflow: 'hidden',
    ...shadow.lg,
  },
  // Drains left-anchored from full width to nothing over the toast's lifetime.
  countdown: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    backgroundColor: accent,
  },
  msg: {
    flex: 1,
    gap: 2,
  },
  title: {
    ...typography.cardTitle,
    fontSize: 13,
    color: neutral[900],
  },
  sub: {
    ...typography.small,
    color: text.secondary,
  },
  undo: {
    flexShrink: 0,
    minHeight: TAP_MIN - 4,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    borderWidth: 1,
    // clay[600], not the clay[400] this used on ink: on ivory that step is 1.89:1,
    // under the 3:1 floor for a control's own outline, so the pill lost its edge.
    borderColor: clay[600],
  },
  // clay[300] was legible on ink and is far too pale on ivory. onClay is the ramp
  // step the theme vouches for as accent-coloured copy that passes on the light side.
  undoText: {
    ...typography.button,
    fontSize: 12,
    color: text.onClay,
  },
});
