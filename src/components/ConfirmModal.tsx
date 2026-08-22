import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { neutral, radius, shadow, surface, text, typography } from '@/theme';

/** A small themed confirm dialog — a gentle guard before something destructive.
 * Works on web and native (RN Modal). Purely presentational; the caller owns
 * what "confirm" does. */
export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: {
  visible: boolean;
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.overlay} onPress={onCancel}>
        <Pressable style={styles.card} onPress={() => {}}>
          {title ? <Text style={styles.title}>{title}</Text> : null}
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <Button label={cancelLabel} tone="ghost" onPress={onCancel} />
            <Button
              label={confirmLabel}
              tone={destructive ? 'danger' : 'primary'}
              onPress={onConfirm}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: surface.overlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 26,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: surface.base,
    borderRadius: radius.lg,
    padding: 26,
    ...shadow.lg,
  },
  title: { ...typography.heading, color: neutral[900], marginBottom: 8 },
  message: { ...typography.body, fontSize: 14, lineHeight: 22, color: text.secondary },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
});
