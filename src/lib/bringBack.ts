import type { ApiInsight, ApiRecall } from '@/lib/api';
import { kanaId, type KanaItem } from '@/lib/kana';

/**
 * One thing to meet again: a highlight the schedule says is due, a line from a tips
 * capture, or a character off the hiragana chart.
 *
 * One flat sequence rather than three piles, because the screen shows one at a time
 * and taps through them — cycling wants an order, not categories.
 */
export type BringBack =
  | { kind: 'recall'; id: string; item: ApiRecall }
  | { kind: 'kana'; id: string; item: KanaItem }
  | {
      kind: 'tip';
      id: string;
      /** The back: the takeaway or step, as it was distilled. */
      text: string;
      /** The front: the capture, asked as a question. */
      cue: string;
      /** The pile it files under — 'Tips · @handle'. */
      source: string;
      /** Where it was captured from, worn as a chip: 'YouTube', 'TikTok'. */
      platform: string;
      /** 'YYYY-MM-DD' the capture was saved. */
      day: string;
      /** A step to do, rather than an idea to keep. */
      action: boolean;
    };

/** How each platform's captures are named on a card, and what to call one. */
const PLATFORMS: Record<string, { chip: string; phrase: string }> = {
  youtube: { chip: 'YouTube', phrase: 'The YouTube video' },
  tiktok: { chip: 'TikTok', phrase: 'The TikTok clip' },
  instagram: { chip: 'Instagram', phrase: 'The Instagram clip' },
};

const SAVED_LINK = { chip: 'saved link', phrase: 'The page you saved' };

/** The chip a tip wears: where it was captured from. */
export function platformChip(source: string): string {
  return (PLATFORMS[source] ?? SAVED_LINK).chip;
}

/**
 * The openers a summary tends to start with, and which are dead weight once the
 * summary is spliced into a question: 'A breakdown of why plans fail' is about why
 * plans fail, and 'The video explains X' is about X.
 */
const RUN_UP = [
  /^(?:a|an|the)\s+\w+(?:\s+\w+)?\s+(?:of|on|about|for|into)\s+/i,
  /^(?:this|the)\s+(?:video|clip|post|page|article|creator)\s+\w+(?:\s+down)?\s+/i,
];

/**
 * The capture's own subject, short enough to sit inside a question — or empty when
 * the summary won't shorten into one. Long or awkward beats nothing here: the cue
 * has a shape that works without a topic, and a mangled half-sentence in the middle
 * of the question is worse than a question that doesn't name the subject.
 */
export function topicOf(summary: string): string {
  const first = summary.trim().split(/(?<=[.!?])\s/)[0] ?? '';
  let topic = first.replace(/[.!?]+$/, '').trim();
  for (const pattern of RUN_UP) topic = topic.replace(pattern, '');
  if (topic.length < 3 || topic.length > 64) return '';
  // Lowercased to read as a phrase mid-sentence, but an acronym or a name keeps its
  // capital — 'on ETFs' and 'on Kelly sizing', not 'on eTFs'.
  if (/^[A-Z][a-z]/.test(topic)) return topic.charAt(0).toLowerCase() + topic.slice(1);
  return topic;
}

/**
 * A tip's front, written from the capture it came from.
 *
 * A tip was distilled as an answer, so it arrives with no question — and shown
 * plainly it is only ever read. What it does have is a source, so the source
 * becomes the question: you are asked what the video said, and the tip is what you
 * have to produce. The ask splits on idea versus step, because remembering a thing
 * you meant to do is a different act from remembering a thing you learned.
 */
export function buildTipCue(summary: string, source: string, action: boolean): string {
  const { phrase } = PLATFORMS[source] ?? SAVED_LINK;
  const ask = action ? 'what did it say to actually do?' : 'what did it actually say?';
  const topic = topicOf(summary);
  if (!topic) return `${phrase} — ${ask}`;
  return `${phrase} on ${topic} — ${ask}`;
}

/** One takeaway or step as a card. */
function tipEntry(insight: ApiInsight, id: string, text: string, action: boolean): BringBack {
  return {
    kind: 'tip',
    id,
    text,
    cue: buildTipCue(insight.summary, insight.source, action),
    source: `Tips · ${insight.title}`,
    platform: platformChip(insight.source),
    day: insight.created_at.slice(0, 10),
    action,
  };
}

/**
 * Everything due, then the tips library, then the whole shelf of past highlights and
 * the rest of the kana chart.
 *
 * The order is the point: a due highlight or a kana the ladder owes is due today and
 * grading it is what moves the schedule, where a tip is only ever there to be read
 * again. Tips first would let browsing quietly replace the work. The two tails come
 * last because they can be hundreds long — anywhere earlier and tapping would never
 * reach what follows them.
 *
 * The shelf is deduped against the due set, so a highlight owed today is asked once
 * up front rather than met again mid-browse.
 *
 * Motivation captures are deliberately absent — their quotes and takeaways feed the
 * daily line on Status, and having them turn up here too would put the same content
 * in two places.
 */
export function buildBringBack(
  recall: ApiRecall[],
  insights: ApiInsight[],
  library: ApiRecall[] = [],
  kana: KanaItem[] = [],
): BringBack[] {
  const out: BringBack[] = recall.map((item) => ({ kind: 'recall', id: item.id, item }));
  for (const item of kana) {
    if (item.due) out.push({ kind: 'kana', id: kanaId(item.char), item });
  }
  for (const i of insights) {
    if (i.kind !== 'tips') continue;
    // Takeaways are the ideas, steps are what to do about them — both worth meeting
    // again, flagged apart so the screen can say which it's showing. Ids are prefixed
    // by the capture so two captures can't collide as list keys.
    i.takeaways.forEach((t, n) => out.push(tipEntry(i, `${i.id}-t${n}`, t, false)));
    i.steps.forEach((t, n) => out.push(tipEntry(i, `${i.id}-s${n}`, t, true)));
  }
  const due = new Set(recall.map((r) => r.id));
  for (const item of library) {
    if (due.has(item.id)) continue;
    out.push({ kind: 'recall', id: item.id, item });
  }
  for (const item of kana) {
    if (!item.due) out.push({ kind: 'kana', id: kanaId(item.char), item });
  }
  return out;
}
