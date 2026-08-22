import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { font, ink, radius, shadow, surface, text as palette, typography } from '@/theme';

/**
 * The System window.
 *
 * The System is a window, not a colour: the palette is untouched — sand, ivory,
 * clay, sage — and what marks these surfaces out is the *shape*. An espresso panel
 * that opens over the warm page, soft clay brackets at the corners, a tracked
 * all-caps label held between two hairlines, and bracketed counters on anything
 * being measured. Clay on ink does the job the manhwa's electric blue does, with
 * none of the neon.
 *
 * Ink is rationed to at most two windows per screen, so dark keeps meaning *the
 * System is talking* rather than becoming the page.
 */
export function SystemWindow({
  label,
  tone = 'clay',
  style,
  children,
}: PropsWithChildren<{
  /** The tracked word between the rules — "status", "daily quest", "week settled". */
  label: string;
  /** Sage the instant something is cleared. Never a warning, either way. */
  tone?: 'clay' | 'sage';
  style?: StyleProp<ViewStyle>;
}>) {
  const edge = tone === 'sage' ? ink.bracketSage : ink.bracket;
  const rule = tone === 'sage' ? ink.bracketSageRule : ink.bracketRule;
  const fg = tone === 'sage' ? ink.sage : ink.accentDim;
  return (
    <View style={[styles.window, style]}>
      <Brackets color={edge} />
      <View style={styles.head}>
        <View style={[styles.rule, { backgroundColor: rule }]} />
        <Text style={[styles.label, { color: fg }]}>{label}</Text>
        <View style={[styles.rule, { backgroundColor: rule }]} />
      </View>
      {children}
    </View>
  );
}

/** The four corner marks. Drawn as two borders each, so they read as brackets. */
function Brackets({ color, inset = 12, size = 18 }: { color: string; inset?: number; size?: number }) {
  const base = { width: size, height: size, borderColor: color };
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View
        style={[
          styles.corner,
          base,
          { left: inset, top: inset, borderLeftWidth: 2.5, borderTopWidth: 2.5, borderTopLeftRadius: 12 },
        ]}
      />
      <View
        style={[
          styles.corner,
          base,
          { right: inset, top: inset, borderRightWidth: 2.5, borderTopWidth: 2.5, borderTopRightRadius: 12 },
        ]}
      />
      <View
        style={[
          styles.corner,
          base,
          { left: inset, bottom: inset, borderLeftWidth: 2.5, borderBottomWidth: 2.5, borderBottomLeftRadius: 12 },
        ]}
      />
      <View
        style={[
          styles.corner,
          base,
          { right: inset, bottom: inset, borderRightWidth: 2.5, borderBottomWidth: 2.5, borderBottomRightRadius: 12 },
        ]}
      />
    </View>
  );
}

/**
 * The sand-side divider: a tracked word, then a hairline running to the edge. What
 * separates one section of the page from the next without adding another card.
 */
export function SectionRule({ label, trailing }: { label: string; trailing?: string }) {
  return (
    <View style={styles.sectionRule}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.sectionLine} />
      {trailing ? <Text style={styles.sectionTrailing}>{trailing}</Text> : null}
    </View>
  );
}

/**
 * `[ 12 / 12 ]` — monospace, and only ever on something the System is measuring.
 * Never body copy: that's the whole rule for the mono face.
 */
export function Counter({ done, total, color, unit }: { done: number | string; total?: number | string; color?: string; unit?: string }) {
  const inner = total == null ? `${done}${unit ?? ''}` : `${done} / ${total}${unit ?? ''}`;
  return <Text style={[styles.counter, color ? { color } : null]}>{`[ ${inner} ]`}</Text>;
}

/** The band at the foot of a quest window: what the System pays for this one. */
export function RewardBand({ xp, tone = 'clay' }: { xp: number; tone?: 'clay' | 'sage' }) {
  const sage = tone === 'sage';
  return (
    <View style={[styles.reward, { backgroundColor: sage ? ink.sageFill : ink.clayFill }]}>
      <Text style={[styles.rewardLabel, { color: sage ? ink.sage : ink.accentDim }]}>Reward</Text>
      <Text style={[styles.rewardValue, { color: sage ? ink.sage : ink.accent }]}>+{xp} XP</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  window: {
    backgroundColor: ink.bg,
    borderRadius: 24,
    paddingVertical: 24,
    paddingHorizontal: 22,
    gap: 18,
    ...shadow.md,
  },
  corner: { position: 'absolute' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rule: { flex: 1, height: 1 },
  label: {
    ...typography.kicker,
    fontSize: 9.5,
    letterSpacing: 2.8,
  },
  sectionRule: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 6, paddingHorizontal: 2 },
  sectionLabel: { ...typography.kicker, fontSize: 9.5, letterSpacing: 2.1, color: palette.secondary },
  sectionLine: { flex: 1, height: 1, backgroundColor: surface.hairline },
  sectionTrailing: { ...typography.small, color: palette.secondary },
  counter: {
    fontFamily: font.mono,
    fontSize: 11.5,
    lineHeight: 16,
    color: ink.textDim,
  },
  reward: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    padding: 15,
  },
  rewardLabel: { ...typography.kicker, fontSize: 9.5, letterSpacing: 2 },
  rewardValue: { ...typography.numeral, fontSize: 20, marginLeft: 'auto', includeFontPadding: false },
});
