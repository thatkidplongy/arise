import type { PropsWithChildren } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { neutral, radius, shadow, space, surface, text, typography } from '@/theme';

/**
 * The four surfaces the whole app is built from.
 *
 * `plain` is the default ivory card. `clay` is the North Star and whatever is
 * happening right now. `sage` is the second voice — cleared, rested, safe, never a
 * warning. `dashed` is an invitation: rest days, empty states, disclaimers.
 */
export type CardTone = 'plain' | 'clay' | 'sage' | 'dashed' | 'ink';

interface Props {
  tone?: CardTone;
  /** Elevation. Only the cards that need lifting off the sand get it. */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Card({ tone = 'plain', raised = false, style, children }: PropsWithChildren<Props>) {
  return <View style={[styles.card, TONES[tone], raised ? shadow.sm : null, style]}>{children}</View>;
}

/** A screen's own name, flush left. */
export function ScreenTitle({ children }: PropsWithChildren) {
  return <Text style={styles.screenTitle}>{children}</Text>;
}

/** The line under a screen title — what this place is for. */
export function ScreenBlurb({ children }: PropsWithChildren) {
  return <Text style={styles.blurb}>{children}</Text>;
}

/** A heading inside a card. */
export function SectionTitle({ children, style }: PropsWithChildren<{ style?: TextStyle }>) {
  return <Text style={[styles.sectionTitle, style]}>{children}</Text>;
}

/** Tracked, uppercase, above the thing it names. */
export function Kicker({ children, color }: PropsWithChildren<{ color?: string }>) {
  return <Text style={[styles.kicker, color ? { color } : null]}>{children}</Text>;
}

const TONES: Record<CardTone, ViewStyle> = {
  plain: { backgroundColor: surface.card },
  clay: { backgroundColor: surface.clayPatch },
  sage: { backgroundColor: surface.sagePatch },
  dashed: { borderWidth: 2, borderStyle: 'dashed', borderColor: surface.edge },
  ink: { backgroundColor: surface.system },
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: space.xl - 4,
    gap: space.md,
  },
  screenTitle: {
    ...typography.screenTitle,
    color: neutral[900],
    paddingLeft: 2,
  },
  blurb: {
    ...typography.body,
    color: text.secondary,
    paddingLeft: 2,
    marginTop: -8,
  },
  sectionTitle: {
    ...typography.section,
    color: neutral[900],
  },
  kicker: {
    ...typography.kicker,
    color: text.secondary,
  },
});
