import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { accent, feedback, surface, text, withAlpha } from '@/theme';

export default function AchievementsScreen() {
  const state = useSystem((s) => s.state);
  const equipTitle = useSystem((s) => s.equipTitle);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const toggleTitle = async (id: string, title: string, isEquipped: boolean) => {
    if (pendingId) return;
    setPendingId(id);
    await equipTitle(isEquipped ? null : title);
    setPendingId(null);
  };

  if (!state) {
    return (
      <Screen>
        <ConnectionPanel />
      </Screen>
    );
  }

  const unlockedCount = state.achievements.filter((a) => a.unlocked_at != null).length;
  const equipped = state.player.equipped_title;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>Achievements</Text>
        <Text style={styles.count}>
          {unlockedCount} / {state.achievements.length}
        </Text>
      </View>

      {state.achievements.map((a) => {
        const unlocked = a.unlocked_at != null;
        const isEquipped = a.title_reward != null && equipped === a.title_reward;
        return (
          <SystemPanel key={a.id} style={unlocked ? undefined : styles.locked}>
            <View style={styles.row}>
              <View
                style={[
                  styles.iconBox,
                  { backgroundColor: withAlpha(unlocked ? feedback.gold : text.faint, 0.14) },
                ]}
              >
                <Ionicons
                  name={unlocked ? 'trophy' : 'lock-closed'}
                  size={18}
                  color={unlocked ? feedback.gold : text.faint}
                />
              </View>
              <View style={styles.body}>
                <Text style={styles.name}>{a.name}</Text>
                <Text style={styles.desc}>{a.desc}</Text>
                {unlocked ? (
                  <Text style={styles.date}>
                    Unlocked {new Date(a.unlocked_at!).toLocaleDateString()}
                  </Text>
                ) : a.title_reward ? (
                  <Text style={styles.date}>Title reward hidden</Text>
                ) : null}
              </View>
            </View>

            {a.title_reward && unlocked ? (
              <Pressable
                disabled={pendingId === a.id}
                style={({ pressed }) => [
                  styles.equipBtn,
                  isEquipped && styles.equipBtnOn,
                  (pressed || pendingId === a.id) && { opacity: 0.75 },
                ]}
                onPress={() => toggleTitle(a.id, a.title_reward!, isEquipped)}
              >
                <Text style={[styles.equipText, isEquipped && styles.equipTextOn]}>
                  {pendingId === a.id
                    ? 'Saving…'
                    : isEquipped
                      ? `Equipped · ${a.title_reward}`
                      : `Equip title · ${a.title_reward}`}
                </Text>
              </Pressable>
            ) : null}
          </SystemPanel>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  h1: {
    color: text.primary,
    fontSize: 20,
    fontWeight: '700',
  },
  count: {
    color: text.secondary,
    fontSize: 14,
    fontWeight: '600',
  },
  locked: {
    opacity: 0.6,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: text.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  desc: {
    color: text.secondary,
    fontSize: 12,
  },
  date: {
    color: feedback.gold,
    fontSize: 11,
    marginTop: 2,
  },
  equipBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: accent,
    borderRadius: 9,
    paddingVertical: 9,
    alignItems: 'center',
  },
  equipBtnOn: {
    backgroundColor: withAlpha(accent, 0.12),
  },
  equipText: {
    color: accent,
    fontSize: 13,
    fontWeight: '600',
  },
  equipTextOn: {
    color: accent,
  },
});
