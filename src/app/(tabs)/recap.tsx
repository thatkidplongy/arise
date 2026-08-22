import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BackLink } from '@/components/BackLink';
import { Screen } from '@/components/Screen';
import { SystemPanel } from '@/components/SystemPanel';
import { XpBar } from '@/components/XpBar';
import { Card } from '@/components/ui/Card';
import { Segmented } from '@/components/ui/Segmented';
import { Counter, SectionRule, SystemWindow } from '@/components/ui/SystemWindow';
import { Text } from '@/components/ui/Text';
import { dateKey } from '@/lib/dates';
import { recapFor, weekLabel, weekOf } from '@/lib/recap';
import { useHistory } from '@/query/useHistory';
import { STAT_META, STAT_TINT, ink, neutral, sage, text, typography, withAlpha } from '@/theme';

type Which = 'this' | 'last';

/** The one warm line the numbers earn — never a scold, never a shortfall. */
function lineFor(days: number, quests: number, leaned: string | null): string {
  if (quests === 0) return 'Nothing logged this week. The board is the same size whenever you come back.';
  if (days >= 6) return `Almost every day of it, and ${quests} quests finished. That is a lot of showing up.`;
  if (leaned) return `${days} day${days === 1 ? '' : 's'} of it, leaning into ${leaned}. Whatever you managed counts.`;
  return `${days} day${days === 1 ? '' : 's'} of it, ${quests} quests finished.`;
}

export default function RecapScreen() {
  const { history, loading } = useHistory();
  const [which, setWhich] = useState<Which>('this');

  const week = weekOf(dateKey(), which === 'this' ? 0 : -1);
  const recap = recapFor(history, week);
  const busiest = Math.max(1, ...recap.byStat.map((s) => s.quests));
  const leaned = recap.leaned ? STAT_META[recap.leaned].label : null;

  return (
    <Screen>
      <BackLink />
      <SectionRule label="Recap" trailing={weekLabel(week)} />

      <Segmented
        value={which}
        onChange={setWhich}
        options={[
          { value: 'this', label: 'This week' },
          { value: 'last', label: 'Last week' },
        ]}
      />

      <SystemWindow label={which === 'this' ? 'Week so far' : 'Week settled'} tone={recap.days >= 5 ? 'sage' : 'clay'}>
        <View style={styles.figures}>
          <Figure value={recap.days} label="days shown up" />
          <Figure value={recap.quests} label="quests" />
          <Figure value={recap.xp.toLocaleString()} label="XP" accent />
        </View>
        <Text style={styles.line}>
          {loading ? 'Counting the week…' : lineFor(recap.days, recap.quests, leaned)}
        </Text>
      </SystemWindow>

      <SystemPanel title="Where the week went">
        {recap.byStat.map((row) => {
          const meta = STAT_META[row.key];
          return (
            <View key={row.key} style={styles.barRow}>
              <View style={styles.barHead}>
                <Text style={[styles.barKey, { color: meta.color }]}>{row.key}</Text>
                <Text style={styles.barLabel}>{meta.label}</Text>
                <Counter done={row.quests} unit={row.quests === 1 ? ' quest' : ' quests'} color={text.secondary} />
              </View>
              <XpBar
                value={row.quests}
                max={busiest}
                color={meta.color}
                height={6}
                track={withAlpha(meta.color, STAT_TINT)}
              />
            </View>
          );
        })}
      </SystemPanel>

      <Card tone="sage">
        <Text style={styles.settleTitle}>Levels settle on their own</Text>
        <Text style={styles.settleBody}>
          An attribute that met its bar this week climbs a tier; one that went quiet eases down by
          one. That is not a penalty — it is a gentler ask next week. Your peaks are permanent, so
          everything you have already reached stays on the record either way.
        </Text>
      </Card>

      <Card tone="dashed">
        <Text style={styles.foot}>
          Counted from your finished-quest log, so it only ever reflects what actually landed. Rest
          days aren&apos;t in these numbers, and they cost you nothing.
        </Text>
      </Card>
    </Screen>
  );
}

function Figure({ value, label, accent }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <View style={styles.figure}>
      <Text style={[styles.figureValue, accent ? { color: ink.accent } : null]}>{value}</Text>
      <Text style={styles.figureLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', gap: 14 },
  figure: { flex: 1, gap: 2 },
  figureValue: { ...typography.numeral, fontSize: 34, color: ink.text, includeFontPadding: false },
  figureLabel: { ...typography.tiny, color: ink.textDim },
  line: { ...typography.body, lineHeight: 22, color: 'rgba(249, 244, 237, 0.82)' },
  barRow: { gap: 6, paddingVertical: 7 },
  barHead: { flexDirection: 'row', alignItems: 'baseline', gap: 9 },
  barKey: { ...typography.kicker, fontSize: 9.5, letterSpacing: 1 },
  barLabel: { ...typography.label, flex: 1, color: neutral[800] },
  settleTitle: { ...typography.heading, color: neutral[900] },
  settleBody: { ...typography.body, color: sage[900] },
  foot: { ...typography.body, color: text.secondary },
});
