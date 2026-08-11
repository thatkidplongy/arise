import { useEffect, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useSystem } from '@/store/useSystem';
import { accent, onAccent, surface, text, withAlpha } from '@/theme';
import type { Notice } from '@/types';

/**
 * The System pop-up — level ups, rank ups, achievements. One at a time from
 * the queue, with a soft entrance. Flat and warm; no blur or glow.
 */
export function SystemNoticeHost() {
  const notice = useSystem((s) => s.notices[0]);
  if (!notice) return null;
  // Keyed on the id so each notice is a fresh mount: the entrance starts from the
  // top on its own, without an effect having to reach back and reset it.
  return <NoticeCard key={notice.id} notice={notice} />;
}

/**
 * One notice.
 *
 * The pop is scale-only and the box is opaque from the first frame. It used to
 * fade in from `opacity: 0`, which is the shape that made the completion toast
 * permanently invisible on this RN Web build when the Animated value never
 * reached the DOM node — and a modal that swallows every tap is a worse thing to
 * lose than a toast. If the spring never runs, this just sits at 94% and reads
 * fine; nothing about seeing or dismissing it depends on the animation landing.
 */
function NoticeCard({ notice }: { notice: Notice }) {
  const dismiss = useSystem((s) => s.dismissNotice);
  // State, not a ref: the transform style has to read this during render.
  const [scale] = useState(() => new Animated.Value(0.94));

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 6 }).start();
  }, [scale]);

  return (
    <View style={styles.overlay}>
      <Animated.View style={[styles.box, { transform: [{ scale }] }]}>
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
