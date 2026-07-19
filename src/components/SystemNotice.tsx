import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSystem } from '@/store/useSystem';
import { accent, onAccent, surface, text, withAlpha } from '@/theme';

/**
 * The System pop-up — level ups, rank ups, achievements. One at a time from
 * the queue, with a soft entrance. Flat and warm; no blur or glow.
 */
export function SystemNoticeHost() {
  const notice = useSystem((s) => s.notices[0]);
  const dismiss = useSystem((s) => s.dismissNotice);

  const scale = useRef(new Animated.Value(0.9)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!notice) return;
    scale.setValue(0.9);
    opacity.setValue(0);
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }),
      Animated.timing(opacity, { toValue: 1, duration: 130, useNativeDriver: true }),
    ]).start();
  }, [notice?.id, notice, scale, opacity]);

  if (!notice) return null;

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.box, { transform: [{ scale }], opacity }]}>
        <Text style={styles.kicker}>Notification</Text>
        <Text style={styles.title}>{notice.title}</Text>
        {notice.lines.map((line, i) => (
          <Text key={i} style={styles.line}>
            {line}
          </Text>
        ))}
        <Pressable
          style={({ pressed }) => [styles.ok, pressed && { backgroundColor: accentPressed }]}
          onPress={dismiss}
        >
          <Text style={styles.okText}>OK</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const accentPressed = withAlpha(accent, 0.85);

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: surface.overlay,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
  },
  box: {
    width: '100%',
    maxWidth: 330,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 6,
  },
  kicker: {
    color: accent,
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  title: {
    color: text.primary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  line: {
    color: text.secondary,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 19,
  },
  ok: {
    marginTop: 16,
    backgroundColor: accent,
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 44,
  },
  okText: {
    color: onAccent,
    fontWeight: '700',
    fontSize: 14,
  },
});
