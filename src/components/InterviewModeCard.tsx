import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

import { SystemPanel } from '@/components/SystemPanel';
import { useSystem } from '@/store/useSystem';
import { STAT_META, text, withAlpha } from '@/theme';

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
    <SystemPanel title="Interview mode" sub={on ? 'On' : 'Off'}>
      <Text style={styles.help}>
        For Craft. Turn this on when an interview is on the horizon: your coding daily adds problem
        drills, and the weekly and side quests shift to interview prep — timed DSA sets, mock
        system-design, and behavioural (STAR) stories. Turn it off any time to go back to steady
        craft growth. Your level and peak carry over either way.
      </Text>
      <Pressable
        disabled={saving}
        onPress={toggle}
        style={({ pressed }) => [
          styles.toggle,
          on && styles.toggleOn,
          (pressed || saving) && { opacity: 0.8 },
        ]}
      >
        <Ionicons
          name={on ? 'checkmark-circle' : 'ellipse-outline'}
          size={18}
          color={on ? '#FBF5EB' : STAT_META.CFT.color}
        />
        <Text style={[styles.toggleText, { color: on ? '#FBF5EB' : STAT_META.CFT.color }]}>
          {saving
            ? 'Saving…'
            : on
              ? 'Interview mode is on — tap to turn off'
              : 'Turn on interview mode'}
        </Text>
      </Pressable>
    </SystemPanel>
  );
}

const styles = StyleSheet.create({
  help: { color: text.secondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 9,
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: withAlpha(STAT_META.CFT.color, 0.5),
    backgroundColor: withAlpha(STAT_META.CFT.color, 0.08),
  },
  toggleOn: { backgroundColor: STAT_META.CFT.color, borderColor: STAT_META.CFT.color },
  toggleText: { fontSize: 14, fontWeight: '700' },
});
