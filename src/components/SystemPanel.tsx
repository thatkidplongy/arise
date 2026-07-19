import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewProps } from 'react-native';

import { surface, text } from '@/theme';

interface Props extends ViewProps {
  title?: string;
  sub?: string;
  /** Show a chevron and let the header toggle the body open/closed. */
  collapsible?: boolean;
  /** Start collapsed (only meaningful with `collapsible`). */
  defaultCollapsed?: boolean;
}

/** A flat, warm card. A quiet header label does the work — no borders-within-borders.
 * Pass `collapsible` to let the header fold the body away (state is per-session). */
export function SystemPanel({
  title,
  sub,
  collapsible,
  defaultCollapsed = false,
  children,
  style,
  ...rest
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  const canCollapse = collapsible && !!title;
  const isOpen = !canCollapse || !collapsed;

  const header = title ? (
    <View
      style={[styles.header, canCollapse && styles.headerCentered, !isOpen && styles.headerClosed]}
    >
      <Text style={styles.headerText}>{title}</Text>
      {sub ? <Text style={styles.subText}>{sub}</Text> : null}
      {canCollapse ? (
        <Ionicons
          name={isOpen ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={text.faint}
          style={sub ? styles.chevron : styles.chevronAlone}
        />
      ) : null}
    </View>
  ) : null;

  return (
    <View style={[styles.panel, style]} {...rest}>
      {canCollapse ? (
        <Pressable
          onPress={() => setCollapsed((c) => !c)}
          style={({ pressed }) => (pressed ? styles.headerPressed : undefined)}
          accessibilityRole="button"
          accessibilityState={{ expanded: isOpen }}
        >
          {header}
        </Pressable>
      ) : (
        header
      )}
      {isOpen ? children : null}
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
  // A chevron has no text baseline, so center the row when one is present.
  headerCentered: {
    alignItems: 'center',
  },
  // No body follows when closed, so drop the gap the header would otherwise leave.
  headerClosed: {
    marginBottom: 0,
  },
  headerPressed: {
    opacity: 0.6,
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
  chevron: {
    marginLeft: 8,
  },
  chevronAlone: {
    marginLeft: 'auto',
  },
});
