import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { typography } from '@/theme';

/**
 * One edge-marked block: a coloured rule down the side, then everything it sorts.
 *
 * The v2 language's alternative to a tinted card — the rule does the sorting a
 * coloured patch used to, so several unlike things can share a stretch of page
 * without it becoming a stack of coloured boxes. There is no fill and no card
 * behind it; the rule is load bearing and the sand page shows through.
 *
 * `kicker` is the small caps label above the body, tinted to match the rule.
 */
export function EdgeBlock({
  edge,
  kicker,
  kickerColor,
  children,
}: PropsWithChildren<{ edge: string; kicker?: string; kickerColor?: string }>) {
  return (
    <View style={styles.block}>
      <View style={[styles.edge, { backgroundColor: edge }]} />
      <View style={styles.body}>
        {kicker ? <Text style={[styles.kicker, { color: kickerColor ?? edge }]}>{kicker}</Text> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { flexDirection: 'row', gap: 16 },
  // The rule runs the height of its block, not of the card around it.
  edge: { width: 4, borderRadius: 2, alignSelf: 'stretch' },
  body: { flex: 1, minWidth: 0, gap: 10 },
  kicker: { ...typography.kicker, fontSize: 11, letterSpacing: 1.5 },
});
