import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/components/ui/Text';
import { useCollapse } from '@/hooks/useCollapse';
import { TAP_MIN, neutral, radius, surface, text as palette, typography } from '@/theme';

/** One column of a {@link DataTable}. `render` returns the cell's contents for a
 * row; width pins a column (icon, date, xp), otherwise `flex` shares the rest. */
export type Column<T> = {
  key: string;
  header?: string;
  flex?: number;
  width?: number;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
};

/**
 * A compact, presentable table shared by the log screens (Journal, Reflections,
 * Quest history). One warm card, optional faint column headers, hairline row
 * dividers, and — when `onRowPress` is given — tappable rows with a trailing
 * chevron. Columns size themselves by `width` (fixed) or `flex` (shared), so the
 * same component reads well on a phone or a wide window.
 *
 * Pass a `title` to cap the card with a heading (with an optional `sub`, e.g. a
 * count); add `collapsible` to let that heading fold the whole log away, matching
 * the collapse affordance on {@link SystemPanel}. Collapse state is per-session.
 */
export function DataTable<T>({
  columns,
  rows,
  keyExtractor,
  onRowPress,
  title,
  sub,
  collapsible,
  defaultCollapsed = false,
}: {
  columns: Column<T>[];
  rows: T[];
  keyExtractor: (row: T) => string;
  onRowPress?: (row: T) => void;
  title?: string;
  sub?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}) {
  const tappable = !!onRowPress;
  const hasHeader = columns.some((c) => c.header);
  const canCollapse = !!collapsible && !!title;
  const { open, toggle } = useCollapse(canCollapse, defaultCollapsed);

  const cellStyle = (c: Column<T>) => [
    c.width != null ? { width: c.width } : { flex: c.flex ?? 1 },
    c.align === 'right' ? styles.right : null,
  ];

  const cells = (content: (c: Column<T>) => React.ReactNode) => (
    <>
      {columns.map((c) => (
        <View key={c.key} style={cellStyle(c)}>
          {content(c)}
        </View>
      ))}
      {tappable ? <View style={styles.chevron} /> : null}
    </>
  );

  const titleBar = title ? (
    <View style={[styles.titleBar, open && styles.titleBarOpen]}>
      <Text style={styles.titleText}>{title}</Text>
      {sub ? <Text style={styles.subText}>{sub}</Text> : null}
      {canCollapse ? (
        <Ionicons
          name={open ? 'chevron-down' : 'chevron-forward'}
          size={16}
          color={palette.faint}
          style={sub ? styles.titleChevron : styles.titleChevronAlone}
        />
      ) : null}
    </View>
  ) : null;

  return (
    <View style={styles.table}>
      {canCollapse ? (
        <Pressable
          onPress={toggle}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={({ pressed }) => (pressed ? styles.pressed : undefined)}
        >
          {titleBar}
        </Pressable>
      ) : (
        titleBar
      )}

      {open && hasHeader ? (
        <View style={[styles.row, styles.headRow]}>
          {cells((c) => (c.header ? <Text style={styles.headText}>{c.header}</Text> : null))}
        </View>
      ) : null}

      {open
        ? rows.map((row, i) => {
            const body = (
              <>
                {columns.map((c) => (
                  <View key={c.key} style={cellStyle(c)}>
                    {c.render(row)}
                  </View>
                ))}
                {tappable ? (
                  <View style={styles.chevron}>
                    <Ionicons name="chevron-forward" size={15} color={palette.faint} />
                  </View>
                ) : null}
              </>
            );
            const first = i === 0 && !title && !hasHeader;
            const rowStyle = [styles.row, !first && styles.divider];
            return onRowPress ? (
              <Pressable
                key={keyExtractor(row)}
                onPress={() => onRowPress(row)}
                style={({ pressed }) => [rowStyle, pressed && styles.pressed]}
              >
                {body}
              </Pressable>
            ) : (
              <View key={keyExtractor(row)} style={rowStyle}>
                {body}
              </View>
            );
          })
        : null}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: TAP_MIN,
    paddingVertical: 13,
    paddingHorizontal: 22,
  },
  headRow: { paddingVertical: 8, minHeight: 0 },
  divider: { borderTopWidth: 1, borderTopColor: surface.hairline },
  pressed: { backgroundColor: surface.muted },
  right: { alignItems: 'flex-end' },
  chevron: { width: 16, alignItems: 'flex-end' },
  headText: { ...typography.kicker, fontSize: 10, letterSpacing: 0.8, color: palette.faint },
  titleBar: { flexDirection: 'row', alignItems: 'center', minHeight: TAP_MIN, paddingTop: 20, paddingBottom: 14, paddingHorizontal: 22 },
  titleBarOpen: {},
  titleText: { ...typography.section, color: neutral[900] },
  subText: { ...typography.small, color: palette.secondary, marginLeft: 'auto', paddingLeft: 10 },
  titleChevron: { marginLeft: 8 },
  titleChevronAlone: { marginLeft: 'auto' },
});
