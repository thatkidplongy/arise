import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Text } from '@/components/ui/Text';
import { TAP_MIN, accent, clay, feedback, neutral, onAccent, radius, surface, text, typography, withAlpha } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Every action in the app. Pill-shaped, never below the 44px tap floor, and
 * pressed states come from the clay ramp rather than an opacity fade.
 */
export type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'quiet' | 'danger';

interface Props {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  icon?: IconName;
  /** Fills the row it sits in. */
  block?: boolean;
  busy?: boolean;
  disabled?: boolean;
  /** 52 instead of 48 — for the one action a screen is really about. */
  large?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({
  label,
  onPress,
  tone = 'primary',
  icon,
  block = false,
  busy = false,
  disabled = false,
  large = false,
  style,
}: Props) {
  const off = disabled || busy;
  const skin = TONES[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={off}
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy }}
      style={({ pressed }) => [
        styles.base,
        { minHeight: large ? 52 : 48 },
        skin.rest,
        pressed && !off ? skin.pressed : null,
        block ? styles.block : null,
        off ? styles.off : null,
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={skin.fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon} size={16} color={skin.fg} /> : null}
          <Text style={[styles.label, { color: skin.fg }]} numberOfLines={1}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

/** A round 48px control carrying one glyph — the ✦ in the Status header, and friends. */
export function IconButton({
  icon,
  onPress,
  label,
  active = false,
  size = 48,
}: {
  icon: IconName;
  onPress: () => void;
  /** Not drawn — screen readers only. */
  label: string;
  active?: boolean;
  size?: number;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.icon,
        { width: size, height: size },
        active || pressed ? styles.iconOn : null,
      ]}
    >
      <Ionicons name={icon} size={Math.round(size * 0.4)} color={active ? clay[700] : text.secondary} />
    </Pressable>
  );
}

/** A pill that walks you back up a level. Sits flush left above a screen title. */
export function BackPill({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.back, pressed ? { backgroundColor: clay[200] } : null]}
    >
      <Text style={styles.backLabel}>{`‹  ${label}`}</Text>
    </Pressable>
  );
}

/** A row of buttons that share the width evenly. */
export function ButtonRow({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const TONES: Record<ButtonTone, { rest: ViewStyle; pressed: ViewStyle; fg: string }> = {
  primary: {
    rest: { backgroundColor: accent },
    pressed: { backgroundColor: clay[600] },
    fg: onAccent,
  },
  secondary: {
    rest: { borderWidth: 1, borderColor: clay[500] },
    pressed: { backgroundColor: clay[200] },
    fg: clay[700],
  },
  ghost: {
    rest: {},
    pressed: { backgroundColor: neutral[200] },
    fg: text.secondary,
  },
  quiet: {
    rest: { borderWidth: 1, borderColor: surface.edge },
    pressed: { backgroundColor: clay[200], borderColor: clay[400] },
    fg: neutral[800],
  },
  danger: {
    rest: { borderWidth: 1, borderColor: feedback.danger },
    pressed: { backgroundColor: withAlpha(feedback.danger, 0.12) },
    fg: feedback.danger,
  },
};

const styles = StyleSheet.create({
  base: {
    minWidth: TAP_MIN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 22,
    borderRadius: radius.pill,
  },
  block: { alignSelf: 'stretch' },
  off: { opacity: 0.45 },
  label: typography.button,
  row: { flexDirection: 'row', gap: 10 },
  icon: {
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: surface.edge,
  },
  iconOn: { backgroundColor: clay[200], borderColor: clay[400] },
  back: {
    alignSelf: 'flex-start',
    minHeight: TAP_MIN,
    justifyContent: 'center',
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    backgroundColor: neutral[200],
  },
  backLabel: {
    ...typography.label,
    color: neutral[800],
  },
});
