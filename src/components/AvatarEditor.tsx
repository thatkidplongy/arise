import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProgressRing } from '@/components/ProgressRing';
import { toBoundedDataUri } from '@/lib/image';
import { useAvatar } from '@/store/useAvatar';
import { useSystem } from '@/store/useSystem';
import { accent, onAccent, surface, text, withAlpha } from '@/theme';

/** The tappable profile picture on the You hub: pick a square photo, or remove it.
 * Displayed elsewhere (Status) read-only via useAvatar. */
export function AvatarEditor() {
  const hasAvatar = useSystem((s) => s.state?.player.has_avatar ?? false);
  const uri = useAvatar((s) => s.uri);
  const busy = useAvatar((s) => s.busy);
  const progress = useAvatar((s) => s.progress);
  const load = useAvatar((s) => s.load);
  const save = useAvatar((s) => s.save);

  useEffect(() => {
    if (hasAvatar && uri === null) void load();
  }, [hasAvatar, uri, load]);

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
            <Ionicons name="person-outline" size={30} color={text.faint} />
          )}
          <View style={styles.editBadge}>
            <Ionicons name="camera" size={12} color={onAccent} />
          </View>
        </View>
        {busy ? (
          <View style={styles.progressOverlay} pointerEvents="none">
            <ProgressRing size={84} progress={progress} stroke={3} />
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
  wrap: { alignItems: 'center', gap: 8, marginBottom: 4 },
  ringWrap: { width: 84, height: 84, alignItems: 'center', justifyContent: 'center' },
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
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 1,
    borderColor: withAlpha(accent, 0.4),
    backgroundColor: surface.raised,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  img: { width: 74, height: 74, borderRadius: 37 },
  editBadge: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: accent,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: surface.base,
  },
  actions: { flexDirection: 'row', gap: 16 },
  actionText: { color: accent, fontSize: 13, fontWeight: '600' },
  removeText: { color: text.faint, fontSize: 13, fontWeight: '600' },
});
