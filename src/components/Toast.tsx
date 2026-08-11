import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
 * Deliberately un-animated. An Animated.Value bound to `opacity` here never reached
 * the DOM node on this RN Web build — the toast mounted at opacity 0 and sat there
 * invisible, so a completion that saved perfectly looked like it had done nothing.
 * A confirmation must not depend on an animation landing, so the countdown is plain
 * state and the card itself is plain style. (Animated stays fine for decoration:
 * XpBar's width does drive.)
 */
function ToastView({ toast }: { toast: ToastData }) {
  const undoToast = useSystem((s) => s.undoToast);
  const dismiss = useSystem((s) => s.dismissToast);
  const [left, setLeft] = useState(1); // share of the toast's life remaining, 1 → 0

  useEffect(() => {
    const startedAt = Date.now();
    const tick = setInterval(() => {
      setLeft(Math.max(0, 1 - (Date.now() - startedAt) / TOAST_MS));
    }, 100);
    const timer = setTimeout(() => dismiss(), TOAST_MS);
    return () => {
      clearInterval(tick);
      clearTimeout(timer);
    };
  }, [dismiss]);

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
        <View pointerEvents="none" style={[styles.countdown, { width: `${left * 100}%` }]} />
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
