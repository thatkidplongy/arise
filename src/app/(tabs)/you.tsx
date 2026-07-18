import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AvatarEditor } from '@/components/AvatarEditor';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, surface, text } from '@/theme';

// The occasional screens live here rather than crowding the tab bar. Adding more
// later? Drop another row in — the bar stays at five.
const ITEMS = [
  { icon: 'trophy-outline', label: 'Achievements', sub: 'Titles & milestones', route: '/achievements' },
  { icon: 'compass-outline', label: 'Focus areas', sub: 'Tailor your quests · interview mode', route: '/focus' },
  { icon: 'settings-outline', label: 'Settings', sub: 'North Star · system link · your record', route: '/settings' },
] as const;

export default function YouScreen() {
  const state = useSystem((s) => s.state);

  return (
    <Screen>
      <View style={styles.head}>
        <AvatarEditor />
        <Text style={styles.h1}>You</Text>
        {state ? (
          <Text style={styles.sub}>
            {state.player.name} · Level {state.player.level} · Rank {state.player.rank}
          </Text>
        ) : null}
      </View>

      <SystemPanel>
        {ITEMS.map((it, i) => (
          <Pressable
            key={it.route}
            onPress={() => router.push(it.route)}
            style={({ pressed }) => [styles.row, i > 0 && styles.rowBorder, pressed && { opacity: 0.65 }]}
          >
            <Ionicons name={it.icon} size={20} color={accent} />
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{it.label}</Text>
              <Text style={styles.rowSub}>{it.sub}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={text.faint} />
          </Pressable>
        ))}
      </SystemPanel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { gap: 4, marginBottom: 2, alignItems: 'center' },
  h1: { color: text.primary, fontSize: 20, fontWeight: '700' },
  sub: { color: text.secondary, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: surface.hairline },
  rowText: { flex: 1, gap: 2 },
  rowLabel: { color: text.primary, fontSize: 15, fontWeight: '600' },
  rowSub: { color: text.secondary, fontSize: 12 },
});
