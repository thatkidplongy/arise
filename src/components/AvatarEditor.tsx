import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useEffect } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAvatar } from '@/store/useAvatar';
import { useSystem } from '@/store/useSystem';
import { accent, surface, text, withAlpha } from '@/theme';

/** The tappable profile picture on the You hub: pick a square photo, or remove it.
 * Displayed elsewhere (Status) read-only via useAvatar. */
export function AvatarEditor() {
  const hasAvatar = useSystem((s) => s.state?.player.has_avatar ?? false);
  const uri = useAvatar((s) => s.uri);
  const busy = useAvatar((s) => s.busy);
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
    const asset = res.assets[0];
    let b64 = asset.base64 ?? null;
    let mime = asset.mimeType ?? 'image/jpeg';
    // On web the picker returns a data: URI rather than a base64 field.
    if (!b64 && asset.uri.startsWith('data:')) {
      const m = asset.uri.match(/^data:(.*?);base64,(.*)$/);
      if (m) {
        mime = m[1];
        b64 = m[2];
      }
    }
    if (!b64) return;
    await save(`data:${mime};base64,${b64}`);
  };

  const shown = uri && uri.length > 0 ? uri : null;

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={pick}
        disabled={busy}
        style={({ pressed }) => [styles.ring, pressed && { opacity: 0.85 }]}
      >
        {busy ? (
          <ActivityIndicator color={accent} />
        ) : shown ? (
          <Image source={{ uri: shown }} style={styles.img} />
        ) : (
          <Ionicons name="person-outline" size={30} color={text.faint} />
        )}
        <View style={styles.editBadge}>
          <Ionicons name="camera" size={12} color="#FBF5EB" />
        </View>
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
