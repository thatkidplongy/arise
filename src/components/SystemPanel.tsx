import { StyleSheet, Text, View, type ViewProps } from 'react-native';

import { surface, text } from '@/theme';

interface Props extends ViewProps {
  title?: string;
  sub?: string;
}

/** A flat, warm card. A quiet header label does the work — no borders-within-borders. */
export function SystemPanel({ title, sub, children, style, ...rest }: Props) {
  return (
    <View style={[styles.panel, style]} {...rest}>
      {title ? (
        <View style={styles.header}>
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
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: surface.hairline,
    borderRadius: 14,
    padding: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 14,
  },
  headerText: {
    color: text.secondary,
    fontSize: 13,
    fontWeight: '600',
  },
  subText: {
    color: text.faint,
    fontSize: 12,
    marginLeft: 'auto',
  },
});
