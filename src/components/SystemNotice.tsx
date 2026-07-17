import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useSystem } from '@/store/useSystem';
import { colors, withAlpha } from '@/theme';

/**
 * The System's pop-up window — level ups, rank ups, achievements.
 * Renders above everything; shows one notice at a time from the queue.
 */
export function SystemNoticeHost() {
  const notice = useSystem((s) => s.notices[0]);
  const dismiss = useSystem((s) => s.dismissNotice);

  if (!notice) return null;

  return (
    <View style={styles.overlay}>
      <View style={styles.box}>
        <View style={styles.header}>
          <View style={styles.alertIcon}>
            <Text style={styles.alertMark}>!</Text>
          </View>
          <Text style={styles.headerText}>NOTIFICATION</Text>
        </View>
        <Text style={styles.title}>{notice.title}</Text>
        {notice.lines.map((line, i) => (
          <Text key={i} style={styles.line}>
            {line}
          </Text>
        ))}
        <Pressable style={({ pressed }) => [styles.ok, pressed && styles.okPressed]} onPress={dismiss}>
          <Text style={styles.okText}>OK</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(3, 6, 12, 0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    zIndex: 100,
  },
  box: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#0B1424',
    borderWidth: 1.5,
    borderColor: colors.primary,
    borderRadius: 6,
    padding: 22,
    alignItems: 'center',
    gap: 6,
    boxShadow: `0 0 30px ${withAlpha(colors.primary, 0.35)}`,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  alertIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertMark: {
    color: colors.primary,
    fontWeight: '800',
    fontSize: 13,
  },
  headerText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 4,
  },
  title: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1,
    textAlign: 'center',
  },
  line: {
    color: colors.textDim,
    fontSize: 13,
    textAlign: 'center',
  },
  ok: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: colors.primary,
    borderRadius: 4,
    paddingVertical: 8,
    paddingHorizontal: 36,
  },
  okPressed: {
    backgroundColor: withAlpha(colors.primary, 0.15),
  },
  okText: {
    color: colors.primary,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
