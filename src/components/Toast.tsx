import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSystem } from '@/store/useSystem';
import { accent, feedback, onAccent, surface, text, withAlpha } from '@/theme';

/** How long a toast lingers before auto-dismissing. The bottom bar drains over
 * exactly this span, so the two always stay in sync. */
const TOAST_MS = 5000;

/**
 * A transient floating confirmation, anchored above the tab bar. Used when a
 * quest auto-completes from ticking its last step — confirms it, and offers a
 * quick undo before fading on its own. A thin bar along the bottom drains as the
 * auto-dismiss timer runs down, so you can see how long you've got to hit Undo.
 */
export function ToastHost() {
  const toast = useSystem((s) => s.toast);
  const undoToast = useSystem((s) => s.undoToast);
  const dismiss = useSystem((s) => s.dismissToast);

  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(24)).current;
  const countdown = useRef(new Animated.Value(1)).current; // 1 = full bar → 0 = gone

  useEffect(() => {
    if (!toast) return;
    opacity.setValue(0);
    translateY.setValue(24);
    countdown.setValue(1);
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.spring(translateY, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 6 }),
    ]).start();
    // Width can't run on the native thread, but it's a single 3px bar — cheap.
    Animated.timing(countdown, { toValue: 0, duration: TOAST_MS, useNativeDriver: false }).start();
    const timer = setTimeout(() => dismiss(), TOAST_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast?.id]);

  if (!toast) return null;

  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <Animated.View style={[styles.toast, { opacity, transform: [{ translateY }] }]}>
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
        <Animated.View
          pointerEvents="none"
          style={[
            styles.countdown,
            { width: countdown.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) },
          ]}
        />
      </Animated.View>
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
