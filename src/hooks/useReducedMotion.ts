import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * Whether the device asks for reduced motion.
 *
 * Anything that flies across the screen has to check this. Confetti is the exact
 * kind of motion that triggers vestibular symptoms, and "Reduce Motion" is the
 * setting where someone has already said so — a celebration nobody asked to be
 * spun by is worse than no celebration.
 *
 * Defaults to false and answers late: the first frame runs before the platform
 * does, and treating an unanswered query as "reduce" would suppress the effect for
 * everyone. It flips as soon as the platform replies, or if the setting changes
 * while the app is open.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let alive = true;
    // Not every platform implements the query (RN Web has been through several
    // shapes of it), and a missing accessibility API must not take the screen down.
    void AccessibilityInfo.isReduceMotionEnabled?.()
      .then((on) => {
        if (alive) setReduced(on);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', setReduced);
    return () => {
      alive = false;
      sub?.remove();
    };
  }, []);

  return reduced;
}
