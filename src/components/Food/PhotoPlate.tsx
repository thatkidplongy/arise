import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import type { ApiFoodEstimate, MealSlot } from '@/lib/api';
import { splitDataUri, toBoundedDataUri } from '@/lib/image';
import { draftFromEstimate, type PlateDraft } from '@/lib/plate';
import { neutral, radius, space, surface, text, typography } from '@/theme';

/**
 * A plate read from a photo.
 *
 * What comes back is portions, not calories — a model can see two cupped hands of
 * rice far more reliably than it can price the oil they were fried in, and a palm
 * is something you can check against your own hand in a second. The read then goes
 * into the sheet as a draft: nothing lands in the day until you've looked at it.
 */
export function PhotoPlate({
  slot,
  analyze,
  onRead,
}: {
  slot: MealSlot;
  analyze: (base64: string, mime: string) => Promise<ApiFoodEstimate>;
  onRead: (draft: PlateDraft) => void;
}) {
  const [shot, setShot] = useState<string | null>(null); // the picked photo, as a data URI
  const [reading, setReading] = useState(false);
  const [error, setError] = useState('');

  const pick = async () => {
    setError('');
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.4, base64: true, allowsEditing: true });
    if (res.canceled || !res.assets?.[0]) return;
    // Downscale (bounded but still legible for label reading) — on web the picker
    // returns the full-res photo, which would otherwise fail to upload.
    const dataUri = await toBoundedDataUri(res.assets[0], 1024, 0.7);
    if (!dataUri) {
      setError('Could not read that image — try another, or log the plate by hand.');
      return;
    }
    setShot(dataUri);
  };

  const read = async () => {
    if (!shot) return;
    const { base64, mime } = splitDataUri(shot);
    setReading(true);
    try {
      const estimate = await analyze(base64, mime);
      onRead(draftFromEstimate(estimate, slot));
      setShot(null);
    } catch {
      setError('Couldn’t read that photo — try another shot, or log the plate by hand.');
    }
    setReading(false);
  };

  if (!shot) {
    return (
      <View style={styles.wrap}>
        <Button label="Read a photo" icon="camera-outline" tone="quiet" block onPress={pick} />
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Image source={{ uri: shot }} style={styles.shot} resizeMode="cover" />
      {reading ? (
        <View style={styles.reading}>
          <ActivityIndicator size="small" color={text.secondary} />
          <Text style={styles.readingText}>Counting the portions…</Text>
        </View>
      ) : (
        <>
          <Text style={styles.hint}>
            It comes back in palms and fists, not calories — and you correct it before it lands.
          </Text>
          <View style={styles.actions}>
            <Button label="Discard" tone="ghost" onPress={() => setShot(null)} />
            <Button label="Read this plate" onPress={read} large style={styles.grow} />
          </View>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm },
  shot: { height: 210, borderRadius: radius.lg, backgroundColor: neutral[200] },
  reading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 22,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: surface.edge,
    borderRadius: radius.lg,
  },
  readingText: { ...typography.label, color: text.secondary },
  hint: { ...typography.small, color: text.secondary },
  actions: { flexDirection: 'row', gap: 10 },
  grow: { flex: 1 },
  error: { ...typography.small, color: text.secondary },
});
