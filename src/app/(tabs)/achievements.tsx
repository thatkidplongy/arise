import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { ACHIEVEMENTS } from '@/data/achievements';
import { useSystem } from '@/store/useSystem';
import { colors } from '@/theme';

export default function AchievementsScreen() {
  const unlocked = useSystem((s) => s.achievements);
  const equipped = useSystem((s) => s.equippedTitle);
  const equipTitle = useSystem((s) => s.equipTitle);
  const count = Object.keys(unlocked).length;

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.h1}>ACHIEVEMENTS</Text>
        <Text style={styles.count}>
          {count} / {ACHIEVEMENTS.length}
        </Text>
      </View>

      {ACHIEVEMENTS.map((a) => {
        const unlockedAt = unlocked[a.id];
        const isEquipped = a.titleReward != null && equipped === a.titleReward;
        return (
          <SystemPanel key={a.id} style={unlockedAt ? undefined : styles.locked}>
            <View style={styles.row}>
              <Ionicons
                name={unlockedAt ? 'trophy' : 'lock-closed'}
                size={22}
                color={unlockedAt ? colors.gold : colors.textDim}
              />
              <View style={styles.body}>
                <Text style={styles.name}>{a.name}</Text>
                <Text style={styles.desc}>{a.desc}</Text>
                {unlockedAt ? (
                  <Text style={styles.date}>
                    Unlocked {new Date(unlockedAt).toLocaleDateString()}
                  </Text>
                ) : a.titleReward ? (
                  <Text style={styles.date}>Title reward: ???</Text>
                ) : null}
              </View>
            </View>

            {a.titleReward && unlockedAt ? (
              <Pressable
                style={({ pressed }) => [
                  styles.equipBtn,
                  isEquipped && styles.equippedBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={() => equipTitle(isEquipped ? null : a.titleReward!)}
              >
                <Text style={[styles.equipText, isEquipped && styles.equippedText]}>
                  {isEquipped ? `TITLE EQUIPPED ✓ 「${a.titleReward}」` : `EQUIP TITLE 「${a.titleReward}」`}
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
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 3,
  },
  count: {
    color: colors.textDim,
    fontSize: 13,
    fontWeight: '700',
  },
  locked: {
    opacity: 0.55,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  body: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  desc: {
    color: colors.textDim,
    fontSize: 12,
  },
  date: {
    color: colors.gold,
    fontSize: 11,
    marginTop: 2,
  },
  equipBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: colors.gold,
    borderRadius: 6,
    paddingVertical: 8,
    alignItems: 'center',
  },
  equippedBtn: {
    backgroundColor: 'rgba(255, 209, 102, 0.12)',
  },
  btnPressed: {
    opacity: 0.7,
  },
  equipText: {
    color: colors.gold,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
  },
  equippedText: {
    color: colors.gold,
  },
});
