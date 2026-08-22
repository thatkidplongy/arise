import { useEffect, useState } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useSystem } from '@/store/useSystem';
import { clay, neutral, radius, sage, shadow, surface, text, typography } from '@/theme';
import type { Notice } from '@/types';

/**
 * The System moment — level ups, rank ups, achievements. One at a time from the
 * queue: one kicker, one enormous number, one warm line. No fanfare, and no
 * penalty language ever appears here.
 */
export function SystemNoticeHost() {
  const notice = useSystem((s) => s.notices[0]);
  if (!notice) return null;
  // Keyed on the id so each notice is a fresh mount: the entrance starts from the
  // top on its own, without an effect having to reach back and reset it.
  return <NoticeCard key={notice.id} notice={notice} />;
}

/** Long titles get a smaller face, so "Rank C" and "The Awakened" both fit one line. */
function sizeFor(title: string): number {
  if (title.length <= 9) return 46;
  if (title.length <= 16) return 34;
  return 27;
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
        <View pointerEvents="none" style={styles.blob} />
        <Text style={styles.kicker}>The System</Text>
        <Text style={[styles.title, { fontSize: sizeFor(notice.title) }]}>{notice.title}</Text>
        {notice.lines.map((line, i) => (
          <Text key={i} style={styles.line}>
            {line}
          </Text>
        ))}
        <Button label="Carry on" onPress={dismiss} block large style={styles.ok} />
      </Animated.View>
    </View>
  );
}

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
    padding: 26,
    zIndex: 100,
  },
  box: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: surface.base,
    borderRadius: 36,
    paddingTop: 34,
    paddingHorizontal: 28,
    paddingBottom: 28,
    alignItems: 'center',
    gap: 14,
    overflow: 'hidden',
    ...shadow.lg,
  },
  // A soft sage shape behind the type — the one decorative mark in the app.
  blob: {
    position: 'absolute',
    left: -50,
    top: -60,
    width: 180,
    height: 180,
    borderRadius: radius.pill,
    backgroundColor: sage[200],
  },
  kicker: {
    ...typography.kicker,
    letterSpacing: 2,
    color: clay[700],
  },
  title: {
    ...typography.numeral,
    color: neutral[900],
    textAlign: 'center',
    includeFontPadding: false,
  },
  line: {
    ...typography.body,
    color: text.secondary,
    textAlign: 'center',
  },
  ok: { marginTop: 6 },
});
