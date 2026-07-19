import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { feedback, onAccent, surface, text } from '@/theme';

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
            <Pressable onPress={onCancel} style={({ pressed }) => [styles.btn, pressed && { opacity: 0.7 }]}>
              <Text style={styles.btnGhost}>{cancelLabel}</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.btn,
                destructive ? styles.btnDanger : styles.btnAccent,
                pressed && { opacity: 0.85 },
              ]}
            >
              <Text style={styles.btnConfirmText}>{confirmLabel}</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(30, 22, 14, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: surface.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: surface.hairline,
    padding: 20,
  },
  title: { color: text.primary, fontSize: 15, fontWeight: '700', marginBottom: 6 },
  message: { color: text.secondary, fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  btn: { borderRadius: 9, paddingVertical: 10, paddingHorizontal: 18 },
  btnGhost: { color: text.secondary, fontSize: 14, fontWeight: '600' },
  btnAccent: { backgroundColor: feedback.gold },
  btnDanger: { backgroundColor: feedback.danger },
  btnConfirmText: { color: onAccent, fontSize: 14, fontWeight: '700' },
});
