import { useEffect, useMemo, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useReducedMotion } from '@/hooks/useReducedMotion';
import { piecesFor } from '@/lib/poppers';
import { clay, motion, sage } from '@/theme';

/** The palette a burst is cut from — the page's own two ramps, nothing new. */
const TONES = [clay[400], clay[300], sage[400], sage[500], clay[500]];

/** Enough to read as a burst, few enough to stay a flourish. */
const COUNT = 14;

/**
 * A short burst of paper over whatever just went right.
 *
 * Fills its parent and throws upward from the bottom edge, so the caller places it
 * where the moment is — above a toast, over a System notice — rather than the other
 * way round. It never takes a tap.
 *
 * Everything is driven by one Animated.Value, interpolated per piece: fifteen
 * separate animations to celebrate ticking a checkbox would be a lot of machinery
 * for a second and a half.
 *
 * Scale, not opacity, is what makes a piece appear and vanish. Two reasons: an
 * Animated opacity has form on this RN Web build for never reaching the DOM node
 * (see Toast), and starting every piece at scale 0 means the failure mode is an
 * invisible burst rather than fifteen dots frozen mid-air.
 */
export function Poppers({ count = COUNT }: { count?: number }) {
  const reduced = useReducedMotion();
  const pieces = useMemo(() => piecesFor(count, TONES.length), [count]);
  // State, not a ref: the transforms below read this during render, which a ref
  // forbids — the same shape XpBar and the System notice already use.
  const [flight] = useState(() => new Animated.Value(0));

  useEffect(() => {
    Animated.timing(flight, {
      toValue: 1,
      duration: motion.poppers,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [flight]);

  if (reduced) return null;

  return (
    <View pointerEvents="none" style={styles.field}>
      {pieces.map((p, i) => {
        // Each piece waits out its delay, then has the rest of the flight. Written
        // as one input range so a delayed piece isn't just a later, faster copy.
        const start = p.delay;
        const span = (v: number) => start + v * (1 - start);
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                left: `${p.from * 100}%`,
                width: p.size,
                height: p.size,
                backgroundColor: TONES[p.tone],
                transform: [
                  {
                    // Up hard, then ease over and begin to come back down — a pop,
                    // not a launch.
                    translateY: flight.interpolate({
                      inputRange: [0, start, span(0.55), 1],
                      outputRange: [0, 0, -p.rise, -p.rise * 0.55],
                    }),
                  },
                  {
                    translateX: flight.interpolate({
                      inputRange: [0, start, 1],
                      outputRange: [0, 0, p.drift],
                    }),
                  },
                  {
                    rotate: flight.interpolate({
                      inputRange: [0, start, 1],
                      outputRange: ['0deg', '0deg', `${p.spin}deg`],
                    }),
                  },
                  {
                    scale: flight.interpolate({
                      inputRange: [0, start, span(0.12), span(0.75), 1],
                      outputRange: [0, 0, 1, 1, 0],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Sits above whatever it decorates and spans its width. `bottom: '100%'` is the
  // whole placement rule: the caller positions the thing, not the confetti.
  field: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: '100%',
    height: 150,
  },
  piece: {
    position: 'absolute',
    bottom: 0,
    borderRadius: 2, // a chip of paper — the radius scale starts well above this size
  },
});
