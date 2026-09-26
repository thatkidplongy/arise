import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CardActions, cardStyles } from '@/components/Inspire/InsightCards';
import { shared } from '@/components/Inspire/shared';
import { Text } from '@/components/ui/Text';
import type { ApiInsight } from '@/lib/api';
import { copyOut, type CopyResult } from '@/lib/copyOut';
import { tutorialMeta, tutorialText } from '@/lib/tutorial';
import { accent, feedback, press, text, typography } from '@/theme';

const COPY_LABELS: Record<CopyResult, string> = {
  copied: 'Copied',
  shared: 'Shared',
  dismissed: 'Copy for AI',
  failed: 'Couldn’t copy',
};

/** A captured tutorial: what it teaches (the header), its main points and the
 * steps in order — kept to hand on, so Copy puts the whole thing on the clipboard
 * as Markdown for another AI to pick up. No quotes, no to-dos: a walkthrough's
 * steps are the tutorial's, not a list of chores. */
export function TutorialCard({
  insight,
  expanded,
  onToggle,
  onRemove,
}: {
  insight: ApiInsight;
  expanded: boolean;
  onToggle: () => void;
  onRemove: (id: string) => void;
}) {
  const [copied, setCopied] = useState<CopyResult | null>(null);

  const copy = async () => {
    const result = await copyOut(tutorialText(insight), insight.title);
    setCopied(result);
    setTimeout(() => setCopied((c) => (c === result ? null : c)), 2000);
  };

  const done = copied === 'copied' || copied === 'shared';
  const empty = insight.takeaways.length === 0 && insight.steps.length === 0;

  return (
    <View style={shared.card}>
      <Pressable style={cardStyles.rowHead} onPress={onToggle} hitSlop={4}>
        <Ionicons name="school-outline" size={16} color={accent} />
        <View style={local.head}>
          <Text style={cardStyles.rowSummary} numberOfLines={expanded ? undefined : 2}>
            {insight.title || insight.summary || 'Captured tutorial'}
          </Text>
          <Text style={local.meta}>{tutorialMeta(insight)}</Text>
        </View>
        <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color={text.faint} />
      </Pressable>

      {expanded ? (
        <>
          {insight.summary && insight.title ? <Text style={cardStyles.bulletText}>{insight.summary}</Text> : null}

          {empty ? <Text style={shared.empty}>Nothing came out of this one.</Text> : null}

          {insight.takeaways.length > 0 ? (
            <View style={cardStyles.takeaways}>
              <Text style={cardStyles.sectionLabel}>MAIN POINTS</Text>
              {insight.takeaways.map((t, i) => (
                <View key={i} style={cardStyles.bulletRow}>
                  <Text style={cardStyles.bulletDot}>•</Text>
                  <Text style={cardStyles.bulletText}>{t}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {insight.steps.length > 0 ? (
            <View style={cardStyles.takeaways}>
              <Text style={cardStyles.sectionLabel}>STEPS</Text>
              {insight.steps.map((s, i) => (
                <View key={i} style={cardStyles.bulletRow}>
                  <Text style={local.stepNum}>{i + 1}.</Text>
                  <Text style={cardStyles.bulletText}>{s}</Text>
                </View>
              ))}
            </View>
          ) : null}

          <CardActions sourceUrl={insight.source_url} id={insight.id} onRemove={onRemove}>
            {!empty ? (
              <Pressable
                onPress={() => void copy()}
                style={({ pressed }) => [cardStyles.actionBtn, pressed && { opacity: press.strong }]}
                hitSlop={6}
              >
                <Ionicons
                  name={done ? 'checkmark-circle' : 'copy-outline'}
                  size={14}
                  color={done ? feedback.success : accent}
                />
                <Text style={[cardStyles.actionText, { color: done ? feedback.success : accent }]}>
                  {COPY_LABELS[copied ?? 'dismissed']}
                </Text>
              </Pressable>
            ) : null}
          </CardActions>
        </>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  head: { flex: 1, gap: 3 },
  meta: { ...typography.small, color: text.faint },
  stepNum: { ...typography.body, lineHeight: 21, color: accent, minWidth: 18 },
});
