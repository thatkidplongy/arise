// Pure, React-free quest-domain helpers.

import type { ApiQuest } from '@/lib/api';

// Contexts where a "write"/"note" verb means DO, not journal (write code, record
// audio, practise kana, repeat N times…). Kept out so those stay normal check-offs.
// Nouns allow a trailing plural; "5×" / "N times" / "N reps" flag drills.
const DOING_CONTEXT =
  /\b(code|snippet|program|function|script|midi|audio|footage|clip|melody|beat|chord|scale|loanword|kana|kanji|katakana|hiragana|push-?up|squat|lunge|plank)s?\b|\d\s*×|\b\d+\s*(times|reps?)\b/;

/**
 * A step whose point is to write/reflect something down (vs. a "do" step). Tapping
 * such a step opens the editor so what you write gets logged. Best-effort by wording;
 * the backend LLM is also told to phrase reflection steps as "Write down…/Note down…/
 * Reflect on…" so new quests get caught (see backend llm.generate).
 */
export function isWriteStep(step: string): boolean {
  const s = step.trim().toLowerCase();
  // Unambiguous journaling signals, anywhere in the step.
  if (/\b(jot|reflect|summari[sz]e|journal)\b/.test(s)) return true;
  if (/in your own words|key ?takeaway|\btakeaway\b/.test(s)) return true;
  if (/\b(one|two|three|four|five|six|\d+)[- ]sentence/.test(s)) return true;
  if (/what (did|do) you (learn|notice|take away|think)|one thing you (learned|noticed|realised|realized)/.test(s))
    return true;
  // A step phrased as a question is a prompt to answer in writing (journaling),
  // not a do-step — e.g. "What drained me?", "Ask: how do I feel right now?".
  if (s.endsWith('?') && !DOING_CONTEXT.test(s)) return true;
  // A writing verb leads the step — unless it's really a "do" step.
  if (/^(write|note|describe|explain|reflect|jot)\b/.test(s) && !DOING_CONTEXT.test(s)) return true;
  // "write … down" split across the phrase, e.g. "write your plan down".
  if (/\bwrite\b/.test(s) && /\bdown\b/.test(s) && !DOING_CONTEXT.test(s)) return true;
  return false;
}

/**
 * Whether a quest has met its target for the period.
 *
 * Trivial, and spelled out in four places across three files — the card, the
 * board's "all done" check and the store, twice. Four chances to write `>` where
 * the rest write `>=`, on the one comparison the whole board is built from.
 */
export function isQuestDone(quest: Pick<ApiQuest, 'done' | 'target'>): boolean {
  return quest.done >= quest.target;
}
