// Pure, React-free quest-domain helpers.

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
  // A writing verb leads the step — unless it's really a "do" step.
  if (/^(write|note|describe|explain|reflect|jot)\b/.test(s) && !DOING_CONTEXT.test(s)) return true;
  // "write … down" split across the phrase, e.g. "write your plan down".
  if (/\bwrite\b/.test(s) && /\bdown\b/.test(s) && !DOING_CONTEXT.test(s)) return true;
  return false;
}
