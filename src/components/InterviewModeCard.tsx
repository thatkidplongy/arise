import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { Text } from '@/components/ui/Text';
import { Toggle } from '@/components/ui/Toggle';
import { useSystem } from '@/store/useSystem';
import { neutral, text, typography } from '@/theme';

/** Craft's interview-mode toggle — steady growth vs interview-prep quests. */
export function InterviewModeCard() {
  const state = useSystem((s) => s.state);
  const setInterviewMode = useSystem((s) => s.setInterviewMode);
  const [saving, setSaving] = useState(false);

  if (!state) return null;
  const on = state.player.interview_mode;

  const toggle = async () => {
    if (saving) return;
    setSaving(true);
    await setInterviewMode(!on);
    setSaving(false);
  };

  return (
    <SystemPanel>
      <View style={styles.row}>
        <View style={styles.copy}>
          <Text style={styles.title}>Interview mode</Text>
          <Text style={styles.help}>
            Swaps Craft for timed DSA, mock system design and STAR stories. Same floor — your level
            and peak carry over either way.
          </Text>
        </View>
        <Toggle value={on} onChange={toggle} label="Interview mode" />
      </View>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  copy: { flex: 1, gap: 4 },
  title: { ...typography.heading, color: neutral[900] },
  help: { ...typography.small, color: text.secondary },
});
