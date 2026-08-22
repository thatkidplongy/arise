import { forwardRef } from 'react';
import {
  StyleSheet,
  Text as RNText,
  TextInput as RNTextInput,
  type TextInput as RNTextInputType,
  type TextProps,
  type TextStyle,
  type TextInputProps,
} from 'react-native';

import { FIGTREE_BY_WEIGHT, font, text } from '@/theme';

/**
 * Every string in the app goes through here, so the Organic type stack is applied
 * once rather than remembered 400 times.
 *
 * A custom family and a `fontWeight` must not travel together on native — Android
 * synthesises a fake bold on top of a face that already has one — so we resolve the
 * weight into the matching Figtree cut and drop the weight. A style that names its
 * own `fontFamily` (Caprasimo, via the `type` presets) is left alone.
 */
function resolveType(style: TextProps['style']): TextStyle {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  if (flat.fontFamily) {
    // Already a deliberate face (Caprasimo, mono). Keep it, lose the weight.
    return flat.fontWeight == null ? flat : { ...flat, fontWeight: undefined };
  }
  const weight = flat.fontWeight == null ? '400' : String(flat.fontWeight);
  return { ...flat, fontFamily: FIGTREE_BY_WEIGHT[weight] ?? font.regular, fontWeight: undefined };
}

/** Drop-in for react-native's Text, with the app's face and ink colour applied. */
export function Text({ style, ...rest }: TextProps) {
  return <RNText {...rest} style={[styles.base, resolveType(style)]} />;
}

/** Drop-in for react-native's TextInput — same face, and a themed placeholder. */
export const TextInput = forwardRef<RNTextInputType, TextInputProps>(function TextInput(
  { style, placeholderTextColor, ...rest },
  ref
) {
  return (
    <RNTextInput
      ref={ref}
      placeholderTextColor={placeholderTextColor ?? text.faint}
      {...rest}
      style={[styles.base, resolveType(style)]}
    />
  );
});

const styles = StyleSheet.create({
  base: {
    color: text.primary,
  },
});
