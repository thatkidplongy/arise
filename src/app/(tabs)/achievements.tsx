import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Card, Kicker, ScreenTitle } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import type { ApiState } from '@/lib/api';
import { useSystem } from '@/store/useSystem';
import { TAP_MIN, clay, feedback, neutral, radius, sage, surface, text, typography } from '@/theme';

type Achievement = ApiState['achievements'][number];

/** Locked, earned, or worn right now — the one word on the right of each row. */
function stateOf(a: Achievement, equipped: string | null): { label: string; color: string } {
  if (a.unlocked_at == null) return { label: 'Locked', color: text.faint };
  if (a.title_reward && equipped === a.title_reward) return { label: 'Equipped', color: sage[700] };
  if (a.title_reward) return { label: 'Equip', color: clay[700] };
  return { label: 'Earned', color: feedback.gold };
}

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
        <BackLink />
        <ConnectionPanel />
      </Screen>
    );
  }

  const unlockedCount = state.achievements.filter((a) => a.unlocked_at != null).length;
  const equipped = state.player.equipped_title;
  const worn = equipped ? state.achievements.find((a) => a.title_reward === equipped) : undefined;

  return (
    <Screen>
      <BackLink />
      <ScreenTitle>Achievements</ScreenTitle>

      {equipped ? (
        <Card tone="clay" style={styles.equipped}>
          <View pointerEvents="none" style={styles.blob} />
          <Kicker color={clay[700]}>Equipped title</Kicker>
          <Text style={styles.equippedName}>{equipped}</Text>
          {worn ? <Text style={styles.equippedWhy}>{worn.desc}</Text> : null}
        </Card>
      ) : null}

      <SystemPanel title="Every milestone" sub={`${unlockedCount} of ${state.achievements.length}`}>
        {state.achievements.map((a, i) => {
          const unlocked = a.unlocked_at != null;
          const isEquipped = a.title_reward != null && equipped === a.title_reward;
          const badge = stateOf(a, equipped);
          const canEquip = unlocked && a.title_reward != null;
          return (
            <Pressable
              key={a.id}
              disabled={!canEquip || pendingId === a.id}
              onPress={() => toggleTitle(a.id, a.title_reward!, isEquipped)}
              style={({ pressed }) => [
                styles.row,
                i > 0 && styles.rowRule,
                !unlocked && styles.locked,
                pressed && canEquip && { opacity: 0.7 },
              ]}
            >
              <View style={[styles.disc, unlocked ? styles.discOn : styles.discOff]}>
                <Text style={[styles.initial, { color: unlocked ? clay[800] : text.faint }]}>
                  {a.name.slice(0, 1).toUpperCase()}
                </Text>
              </View>
              <View style={styles.body}>
                <Text style={styles.name}>{a.name}</Text>
                <Text style={styles.desc}>{a.desc}</Text>
              </View>
              <Text style={[styles.state, { color: badge.color }]}>
                {pendingId === a.id ? 'Saving' : badge.label}
              </Text>
            </Pressable>
          );
        })}
      </SystemPanel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  equipped: { overflow: 'hidden', gap: 8 },
  blob: {
    position: 'absolute',
    right: -34,
    bottom: -44,
    width: 120,
    height: 120,
    borderRadius: radius.pill,
    backgroundColor: clay[200],
  },
  equippedName: { ...typography.numeral, fontSize: 28, lineHeight: 31, color: neutral[900] },
  equippedWhy: { ...typography.body, fontSize: 12.5, color: text.onClay },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    minHeight: TAP_MIN + 20,
    paddingVertical: 16,
  },
  rowRule: { borderTopWidth: 1, borderTopColor: surface.hairline },
  locked: { opacity: 0.55 },
  disc: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  discOn: { backgroundColor: clay[200] },
  discOff: { backgroundColor: neutral[200] },
  initial: { ...typography.numeral, fontSize: 16, includeFontPadding: false },
  body: { flex: 1, gap: 3 },
  name: { ...typography.cardTitle, fontSize: 13.5, color: neutral[900] },
  desc: { ...typography.small, color: text.secondary },
  state: { ...typography.kicker, fontSize: 10.5, letterSpacing: 0.9 },
});
