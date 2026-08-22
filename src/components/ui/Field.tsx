import { forwardRef } from 'react';
import { StyleSheet, type TextInput as RNTextInput, type TextInputProps } from 'react-native';

import { TextInput } from '@/components/ui/Text';
import { neutral, radius, surface, typography } from '@/theme';

/** A single-line field. Pill, like everything else you can touch. */
export const Field = forwardRef<RNTextInput, TextInputProps>(function Field({ style, ...rest }, ref) {
  return <TextInput ref={ref} {...rest} style={[styles.field, style]} />;
});

/** The many-lines version — journal entries, notes, the North Star. */
export const TextArea = forwardRef<RNTextInput, TextInputProps>(function TextArea({ style, ...rest }, ref) {
  return <TextInput ref={ref} multiline textAlignVertical="top" {...rest} style={[styles.area, style]} />;
});

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
  area: {
    ...base,
    ...typography.body,
    minHeight: 96,
    padding: 15,
    lineHeight: 21,
    borderRadius: radius.md,
  },
});
