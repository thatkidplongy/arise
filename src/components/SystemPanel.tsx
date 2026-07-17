import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { colors, withAlpha } from '@/theme';

interface Props extends ViewProps {
  title?: string;
  sub?: string;
}

/** The bordered, faintly glowing window every System screen is built from. */
export function SystemPanel({ title, sub, children, style, ...rest }: Props) {
  return (
    <View style={[styles.panel, style]} {...rest}>
      {title ? (
        <View style={styles.header}>
          <View style={styles.diamond} />
          <Text style={styles.headerText}>{title}</Text>
          {sub ? <Text style={styles.subText}>{sub}</Text> : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: 16,
    boxShadow: `0 0 14px ${withAlpha(colors.primary, 0.12)}`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  diamond: {
    width: 8,
    height: 8,
    backgroundColor: colors.primary,
    transform: [{ rotate: '45deg' }],
  },
  headerText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 3,
  },
  subText: {
    color: colors.textDim,
    fontSize: 11,
    marginLeft: 'auto',
  },
});
