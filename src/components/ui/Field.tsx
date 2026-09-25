import { forwardRef } from 'react';
import { StyleSheet, type TextInput as RNTextInput, type TextInputProps } from 'react-native';

import { TextInput } from '@/components/ui/Text';
import { neutral, radius, surface, text, typography } from '@/theme';

/** A single-line field. Pill, like everything else you can touch. */
export const Field = forwardRef<RNTextInput, TextInputProps>(function Field({ style, ...rest }, ref) {
  return <TextInput ref={ref} {...rest} style={[styles.field, style]} />;
});

/** The many-lines version — journal entries, notes, the North Star. */
export const TextArea = forwardRef<RNTextInput, TextInputProps>(function TextArea({ style, ...rest }, ref) {
  return <TextInput ref={ref} multiline textAlignVertical="top" {...rest} style={[styles.area, style]} />;
});

/**
 * The denser field, for one that sits in a card's own flow.
 *
 * Not a variant of `Field` — a second look four components arrived at
 * independently and wrote out longhand: shorter, smaller type, and on the card's
 * own ground (`surface.base`) rather than the inset fill `Field` uses. That's a
 * real distinction, so it gets a name rather than being flattened into the other
 * one, which would have quietly resized four forms.
 *
 * Spacing stays with the caller: how much room a field leaves beneath it is a
 * question about the form around it, not about the field.
 */
export const CompactField = forwardRef<RNTextInput, TextInputProps>(
  function CompactField({ style, ...rest }, ref) {
    return <TextInput ref={ref} {...rest} style={[styles.compact, style]} />;
  },
);

const base = {
  backgroundColor: surface.muted,
  borderWidth: 1,
  borderColor: surface.hairline,
  color: neutral[900],
} as const;

const styles = StyleSheet.create({
  field: {
    ...base,
    ...typography.body,
    minHeight: 50,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.pill,
  },
  // Deliberately not spread from `base`: it shares the border but not the fill or
  // the ink, so half of base would be overridden anyway and the reader would have
  // to diff the two to see what this actually is.
  compact: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    color: text.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: surface.base,
  },
  area: {
    ...base,
    ...typography.body,
    minHeight: 96,
    padding: 15,
    lineHeight: 21,
    borderRadius: radius.md,
  },
});
