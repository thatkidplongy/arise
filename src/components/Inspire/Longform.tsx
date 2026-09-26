import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { cardStyles } from '@/components/Inspire/InsightCards';
import { Text } from '@/components/ui/Text';
import { copyOut, type CopyResult } from '@/lib/copyOut';
import { accent, feedback, press, text, typography } from '@/theme';

/** The pieces a tutorial and a recipe card share: both are read from a whole
 * source, carry a numbered method, and are made to be handed on. */

const COPY_LABELS: Record<CopyResult, string> = {
  copied: 'Copied',
  shared: 'Shared',
  dismissed: 'Copy for AI',
  failed: 'Couldn’t copy',
};

/** Copy the card out as text, then say for a moment how that went. */
export function CopyButton({ body, title }: { body: () => string; title: string }) {
  const [copied, setCopied] = useState<CopyResult | null>(null);

  const copy = async () => {
    const result = await copyOut(body(), title);
    setCopied(result);
    setTimeout(() => setCopied((c) => (c === result ? null : c)), 2000);
  };

  const done = copied === 'copied' || copied === 'shared';
  return (
    <Pressable
      onPress={() => void copy()}
      style={({ pressed }) => [cardStyles.actionBtn, pressed && { opacity: press.strong }]}
      hitSlop={6}
    >
      <Ionicons name={done ? 'checkmark-circle' : 'copy-outline'} size={14} color={done ? feedback.success : accent} />
      <Text style={[cardStyles.actionText, { color: done ? feedback.success : accent }]}>
        {COPY_LABELS[copied ?? 'dismissed']}
      </Text>
    </Pressable>
  );
}

/** A labelled, numbered list — a tutorial's steps, a recipe's method. */
export function StepList({ label, steps }: { label: string; steps: string[] }) {
  if (steps.length === 0) return null;
  return (
    <View style={cardStyles.takeaways}>
      <Text style={cardStyles.sectionLabel}>{label}</Text>
      {steps.map((s, i) => (
        <View key={i} style={cardStyles.bulletRow}>
          <Text style={longform.stepNum}>{i + 1}.</Text>
          <Text style={cardStyles.bulletText}>{s}</Text>
        </View>
      ))}
    </View>
  );
}

export const longform = StyleSheet.create({
  head: { flex: 1, gap: 3 },
  meta: { ...typography.small, color: text.faint },
  stepNum: { ...typography.body, lineHeight: 21, color: accent, minWidth: 18 },
});
