import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { ProgressRing } from '@/components/ProgressRing';
import { Text } from '@/components/ui/Text';
import { toBoundedDataUri } from '@/lib/image';
import { useAvatar } from '@/query/useAvatar';
import { useSystem } from '@/store/useSystem';
import { clay, onAccent, radius, sage, surface, text, typography } from '@/theme';

/** The tappable profile picture on the You hub: pick a square photo, or remove it.
 * Displayed elsewhere (Status) read-only via useAvatar. */
export function AvatarEditor() {
  const hasAvatar = useSystem((s) => s.state?.player.has_avatar ?? false);
  // The query auto-loads (gated on hasAvatar); no manual load effect needed.
  const { uri, busy, progress, save } = useAvatar(hasAvatar);

  const pick = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      quality: 0.4,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (res.canceled || !res.assets?.[0]) return;
    // Downscale to a small square-ish avatar (well under the upload limit) — on
    // web the picker returns the full-res photo, which would otherwise fail.
    const dataUri = await toBoundedDataUri(res.assets[0], 256, 0.8);
    if (!dataUri) return;
    await save(dataUri);
  };

  const shown = uri && uri.length > 0 ? uri : null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={pick}
        disabled={busy}
        style={({ pressed }) => [styles.ringWrap, pressed && { opacity: 0.85 }]}
      >
        <View style={[styles.ring, busy && { opacity: 0.55 }]}>
          {shown ? (
            <Image source={{ uri: shown }} style={styles.img} />
          ) : (
            <Ionicons name="person-outline" size={40} color={sage[800]} />
          )}
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={14} color={onAccent} />
          </View>
        </View>
        {busy ? (
          <View style={styles.progressOverlay} pointerEvents="none">
            <ProgressRing size={112} progress={progress} stroke={3} />
          </View>
        ) : null}
      </Pressable>
      <View style={styles.actions}>
        <Pressable onPress={pick} disabled={busy} hitSlop={6}>
          <Text style={styles.actionText}>{shown ? 'Change photo' : 'Add a photo'}</Text>
        </Pressable>
        {shown ? (
          <Pressable onPress={() => save('')} disabled={busy} hitSlop={6}>
            <Text style={styles.removeText}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: 10 },
  ringWrap: { width: 112, height: 112, alignItems: 'center', justifyContent: 'center' },
  progressOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    width: 104,
    height: 104,
    borderRadius: radius.pill,
    backgroundColor: sage[300],
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  img: { width: 104, height: 104, borderRadius: radius.pill },
  editBadge: {
    position: 'absolute',
    right: 2,
    bottom: 2,
    width: 30,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: clay[600],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: surface.base,
  },
  actions: { flexDirection: 'row', gap: 8 },
  actionText: {
    ...typography.button,
    fontSize: 12.5,
    minHeight: 40,
    lineHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: surface.muted,
    color: clay[700],
  },
  removeText: {
    ...typography.button,
    fontSize: 12.5,
    minHeight: 40,
    lineHeight: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    color: text.faint,
  },
});
