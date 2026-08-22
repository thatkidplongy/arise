import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { Button } from '@/components/ui/Button';
import { Card, ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { Counter, SystemWindow } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import { activeBoss, bossesFrom, type Boss } from '@/lib/bosses';
import { useSystem } from '@/store/useSystem';
import { clay, ink, neutral, radius, sage, surface, text, typography } from '@/theme';

/** The boss you're furthest into, with every phase you've already cleared. */
function BossWindow({ boss, equipped }: { boss: Boss; equipped: string | null }) {
  const equipTitle = useSystem((s) => s.equipTitle);
  const [saving, setSaving] = useState(false);
  const cleared = boss.phases.filter((p) => p.cleared).length;
  const pct = Math.round((boss.done / boss.target) * 100);
  const worn = boss.title != null && equipped === boss.title;

  const claim = async () => {
    if (saving || boss.title == null) return;
    setSaving(true);
    await equipTitle(boss.title);
    setSaving(false);
  };

  return (
    <SystemWindow label={boss.sealed ? 'Boss · sealed' : 'Boss · in progress'} tone={boss.sealed ? 'sage' : 'clay'}>
      <View style={styles.head}>
        <View style={[styles.ring, boss.sealed ? { borderColor: sage[400] } : null]}>
          <Text style={[styles.ringValue, boss.sealed ? { color: ink.sage } : null]}>
            {cleared}/{boss.phases.length}
          </Text>
          <Text style={[styles.ringCaption, boss.sealed ? { color: ink.sage } : null]}>phases</Text>
        </View>
        <View style={styles.headCopy}>
          <Text style={styles.name}>{boss.name}</Text>
          <Text style={styles.how}>{boss.how}</Text>
          <Counter done={boss.done.toLocaleString()} total={`${boss.target.toLocaleString()} ${boss.unit}`} />
        </View>
      </View>

      <View style={styles.track}>
        <View style={[styles.fill, { width: `${pct}%` }, boss.sealed ? { backgroundColor: sage[400] } : null]} />
      </View>

      <View style={styles.phases}>
        {boss.phases.map((phase) => (
          <View key={phase.at} style={styles.phase}>
            <View style={[styles.dot, phase.cleared ? styles.dotOn : null]}>
              {phase.cleared ? <Ionicons name="checkmark" size={13} color={neutral[900]} /> : null}
            </View>
            <Text style={[styles.phaseText, phase.cleared ? styles.phaseDone : null]}>{phase.label}</Text>
          </View>
        ))}
      </View>

      {boss.title ? (
        <View style={styles.reward}>
          <Text style={styles.rewardKicker}>Reward</Text>
          <Text style={styles.rewardTitle}>{boss.title}</Text>
          <Text style={styles.rewardNote}>
            An equippable title. Nothing else changes — the phases you cleared are already yours.
          </Text>
        </View>
      ) : null}

      {boss.sealed && boss.title && !worn ? (
        <Button label={`Claim ${boss.title}`} onPress={claim} busy={saving} block large />
      ) : null}
    </SystemWindow>
  );
}

export default function BossesScreen() {
  const state = useSystem((s) => s.state);

  if (!state) {
    return (
      <Screen>
        <BackLink />
        <ConnectionPanel />
      </Screen>
    );
  }

  const bosses = bossesFrom(state);
  const active = activeBoss(bosses);
  const waiting = bosses.filter((b) => !b.sealed && b.id !== active?.id);
  const sealed = bosses.filter((b) => b.sealed);

  return (
    <Screen>
      <BackLink />
      <ScreenTitle>Boss{'\n'}fights</ScreenTitle>
      <ScreenBlurb>
        Long milestones with a title at the end. They never expire and they never punish — a lapse
        just pauses one.
      </ScreenBlurb>

      {active ? <BossWindow boss={active} equipped={state.player.equipped_title} /> : null}

      {waiting.length ? (
        <SystemPanel title="Waiting for you">
          {waiting.map((b, i) => (
            <View key={b.id} style={[styles.row, i > 0 && styles.rowRule]}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowName}>{b.name}</Text>
                <Text style={styles.rowHow}>{b.how}</Text>
              </View>
              <Counter done={b.done.toLocaleString()} total={b.target.toLocaleString()} color={text.secondary} />
            </View>
          ))}
        </SystemPanel>
      ) : null}

      {sealed.length ? (
        <SystemPanel title="Sealed" sub={`${sealed.length}`}>
          {sealed.map((b, i) => (
            <View key={b.id} style={[styles.row, i > 0 && styles.rowRule]}>
              <View style={styles.rowCopy}>
                <Text style={styles.rowName}>{b.name}</Text>
                <Text style={styles.rowHow}>{b.title ?? b.how}</Text>
              </View>
              <Text style={styles.sealedMark}>Sealed</Text>
            </View>
          ))}
        </SystemPanel>
      ) : null}

      <Card tone="dashed">
        <Text style={styles.foot}>
          A boss you drift away from doesn&apos;t fail. It sits where you left it, and the phases you
          cleared stay cleared.
        </Text>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  ring: {
    width: 86,
    height: 86,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 3,
    borderColor: ink.bracket,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringValue: { ...typography.numeral, fontSize: 22, color: ink.accent, includeFontPadding: false },
  ringCaption: { ...typography.kicker, fontSize: 8.5, letterSpacing: 1.2, color: ink.accentDim },
  headCopy: { flex: 1, minWidth: 0, gap: 5 },
  name: { ...typography.numeral, fontSize: 26, lineHeight: 28, color: ink.text, includeFontPadding: false },
  how: { ...typography.small, color: ink.textDim },
  track: { height: 10, borderRadius: radius.pill, backgroundColor: ink.track, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: clay[500] },
  phases: { gap: 4 },
  phase: { flexDirection: 'row', alignItems: 'center', gap: 13, minHeight: 40 },
  dot: {
    width: 26,
    height: 26,
    flexShrink: 0,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: ink.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotOn: { backgroundColor: sage[400], borderColor: sage[400] },
  phaseText: { ...typography.body, fontSize: 13.5, color: ink.textDim },
  phaseDone: { color: ink.text },
  reward: { backgroundColor: ink.raised, borderRadius: radius.md, padding: 16, gap: 5 },
  rewardKicker: { ...typography.kicker, fontSize: 9.5, letterSpacing: 1.7, color: ink.accentDim },
  rewardTitle: { ...typography.numeral, fontSize: 20, color: ink.text, includeFontPadding: false },
  rewardNote: { ...typography.small, color: ink.textFaint },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 56, paddingVertical: 14 },
  rowRule: { borderTopWidth: 1, borderTopColor: surface.hairline },
  rowCopy: { flex: 1, minWidth: 0, gap: 3 },
  rowName: { ...typography.cardTitle, fontSize: 13.5, color: neutral[900] },
  rowHow: { ...typography.small, color: text.secondary },
  sealedMark: { ...typography.kicker, fontSize: 10.5, letterSpacing: 0.9, color: sage[700] },
  foot: { ...typography.body, color: text.secondary },
});
