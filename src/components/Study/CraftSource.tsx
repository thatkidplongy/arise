import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { StudyButton, StudyQuietButton } from '@/components/Study/StudyButton';
import { CompactField } from '@/components/ui/Field';
import { Text } from '@/components/ui/Text';
import { saveLabel, useSaveState } from '@/hooks/useSaveState';
import { useSystem } from '@/store/useSystem';
import { radius, text, withAlpha } from '@/theme';

/**
 * The parts only system design has: a source you choose, and a check-in once the
 * phase's material is covered. Japanese and drawing walk a fixed plan, so neither is
 * asked of them — the plan names the step and finishing it is the whole answer.
 */

/** Moving on to the next chapter or page. Folded away like the book picker: it
 * happens once every few sittings, while logging happens every sitting. */
export function ChangeSource({ current, hue }: { current: string; hue: string }) {
  const setCraftSource = useSystem((s) => s.setCraftSource);
  const save = useSaveState();
  const [draft, setDraft] = useState('');
  const canSave = draft.trim().length > 0 && save.state !== 'saving';

  const submit = async () => {
    if (!canSave) return;
    const landed = await save.run(() => setCraftSource(draft.trim()));
    if (landed) setDraft('');
  };

  return (
    <View style={styles.form}>
      <CompactField
        value={draft}
        onChangeText={setDraft}
        style={styles.field}
        placeholder={current ? 'Move on to…' : 'e.g. DDIA ch 5 — Replication'}
        placeholderTextColor={text.faint}
        maxLength={160}
        onSubmitEditing={submit}
      />
      <StudyButton
        label={saveLabel(save.state, current ? 'Change it' : 'Start studying it')}
        hue={hue}
        disabled={!canSave}
        onPress={() => void submit()}
      />
    </View>
  );
}

/** Nothing picked yet — then naming the source *is* the card, with nothing folded. */
export function PickSource({ hue }: { hue: string }) {
  return (
    <>
      <Text style={styles.help}>
        Pick the one thing you’re working through — a DDIA chapter, an Alex Xu chapter, a
        Notion page. The daily follows it until you move on.
      </Text>
      <ChangeSource current="" hue={hue} />
    </>
  );
}

/**
 * The phase check-in: "have you read this phase's material?"
 *
 * Shown only once the pages you've logged cover the phase, and at most once a week.
 * Yes moves you on, not yet holds — no penalty either way, and nothing expires.
 */
export function PhaseReview({ label, hue }: { label: string; hue: string }) {
  const reviewCraftPhase = useSystem((s) => s.reviewCraftPhase);

  return (
    <View
      style={[styles.review, { borderColor: withAlpha(hue, 0.4), backgroundColor: withAlpha(hue, 0.06) }]}
    >
      <Text style={styles.reviewBody}>
        You’ve logged enough to cover {label}. Ready for the next phase?
      </Text>
      <View style={styles.row}>
        <StudyButton label="Yes, move on" hue={hue} onPress={() => void reviewCraftPhase(true)} />
        <StudyQuietButton label="Not yet" onPress={() => void reviewCraftPhase(false)} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { marginBottom: 8 },
  help: { color: text.secondary, fontSize: 12, lineHeight: 17, marginBottom: 10 },
  form: { marginTop: 12 },
  review: {
    marginTop: 14,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: 13,
    gap: 10,
  },
  reviewBody: { color: text.secondary, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', gap: 8 },
});
