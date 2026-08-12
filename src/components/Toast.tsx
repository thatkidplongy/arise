import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSystem } from '@/store/useSystem';
import { accent, feedback, onAccent, surface, text, withAlpha } from '@/theme';
import type { Toast as ToastData } from '@/types';

/** How long a toast lingers before auto-dismissing. The bottom bar drains over
 * exactly this span, so the two always stay in sync. */
const TOAST_MS = 5000;

/**
 * A transient floating confirmation, anchored above the tab bar. Shown whenever a
 * quest reaches done — tapping its check circle or ticking its last step — so a
 * save that worked always says so, with a quick undo before it fades on its own. A
 * thin bar along the bottom drains as the auto-dismiss timer runs down, so you can
 * see how long you've got to hit Undo.
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
        <View style={styles.badge}>
          <Ionicons name="checkmark" size={14} color={onAccent} />
        </View>
        <View style={styles.msg}>
          <Text style={styles.title} numberOfLines={1}>
            {toast.title}
          </Text>
          <Text style={styles.sub}>Complete · +{toast.xp} XP</Text>
        </View>
        <Pressable
          onPress={undoToast}
          hitSlop={10}
          style={({ pressed }) => [styles.undo, pressed && { opacity: 0.7 }]}
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
    bottom: 104,
    alignItems: 'center',
    paddingHorizontal: 16,
    zIndex: 90,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    width: '100%',
    maxWidth: 420,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 12,
    paddingVertical: 11,
    paddingHorizontal: 13,
    // clip the countdown bar to the rounded corners
    overflow: 'hidden',
    // a soft lift off the page
    shadowColor: '#2C2720',
    shadowOpacity: 0.14,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  // Drains left-anchored from full width to nothing over the toast's lifetime.
  countdown: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    backgroundColor: accent,
  },
  badge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: feedback.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  msg: {
    flex: 1,
    gap: 1,
  },
  title: {
    color: text.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  sub: {
    color: text.secondary,
    fontSize: 11,
  },
  undo: {
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: withAlpha(accent, 0.12),
  },
  undoText: {
    color: accent,
    fontSize: 13,
    fontWeight: '700',
  },
});
