import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View, type ViewProps } from 'react-native';

import { Tag, type TagTone } from '@/components/ui/Tag';
import { Text } from '@/components/ui/Text';
import { useCollapse } from '@/hooks/useCollapse';
import { neutral, radius, space, surface, text, typography } from '@/theme';

interface Props extends ViewProps {
  title?: string;
  sub?: string;
  /** A small pill beside the title — "Now", "Done", a count. */
  badge?: { label: string; tone?: TagTone };
  /** Show a chevron and let the header toggle the body open/closed. */
  collapsible?: boolean;
  /** Start collapsed (only meaningful with `collapsible`). */
  defaultCollapsed?: boolean;
}

/**
 * The app's card: over-rounded ivory on the sand ground, no border, and a display
 * heading rather than a grey label — the heading is the only rule the card needs.
 * Pass `collapsible` to let the header fold the body away (state is per-session).
 */
export function SystemPanel({
  title,
  sub,
  badge,
  collapsible,
  defaultCollapsed = false,
  children,
  style,
  ...rest
}: Props) {
  const canCollapse = !!collapsible && !!title;
  const { open: isOpen, toggle } = useCollapse(canCollapse, defaultCollapsed);

  const header = title ? (
    <View
      style={[styles.header, canCollapse && styles.headerCentered, !isOpen && styles.headerClosed]}
    >
      <Text style={styles.headerText}>{title}</Text>
      {badge ? <Tag label={badge.label} tone={badge.tone ?? 'neutral'} style={styles.badge} /> : null}
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
          onPress={toggle}
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
    borderRadius: radius.lg,
    padding: space.xl - 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 15,
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
    ...typography.section,
    color: neutral[900],
    flexShrink: 1,
  },
  badge: {
    marginLeft: 9,
    alignSelf: 'center',
  },
  subText: {
    ...typography.small,
    color: text.secondary,
    marginLeft: 'auto',
    paddingLeft: 10,
  },
  chevron: {
    marginLeft: 8,
  },
  chevronAlone: {
    marginLeft: 'auto',
  },
});
