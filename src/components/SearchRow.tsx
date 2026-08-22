import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Text, TextInput } from '@/components/ui/Text';
import { TAP_MIN, accent, radius, surface, text, typography } from '@/theme';

/** The search input + button shared by the lookup panels. `tone` colours the
 * button/spinner (each panel has its own accent); everything else is standard. */
export function SearchRow({
  value,
  onChangeText,
  onSubmit,
  searching,
  placeholder,
  tone = accent,
  maxLength,
}: {
  value: string;
  onChangeText: (t: string) => void;
  onSubmit: () => void;
  searching: boolean;
  placeholder: string;
  tone?: string;
  maxLength?: number;
}) {
  return (
    <View style={styles.row}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        style={[styles.input, styles.grow]}
        placeholder={placeholder}
        placeholderTextColor={text.faint}
        maxLength={maxLength}
      />
      <Pressable onPress={onSubmit} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}>
        {searching ? (
          <ActivityIndicator size="small" color={tone} />
        ) : (
          <Text style={[styles.btnText, { color: tone }]}>Search</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  input: {
    ...typography.body,
    minHeight: 50,
    borderRadius: radius.pill,
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: surface.muted,
  },
  grow: { flex: 1 },
  btn: {
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: radius.pill,
    minHeight: TAP_MIN,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    minWidth: 74,
    alignItems: 'center',
  },
  btnText: { fontSize: 13, fontWeight: '700' },
});
