import type { StatKey } from '@/types';

export interface DayBlock {
  key: string;
  label: string; // the block's name, plain — the type carries the tone, not a glyph
  startHour: number; // local hour (0–23) this block begins
}

// Four soft windows across the day. Defaults suit a typical day — and a morning
// shift with a late-afternoon activity: Morning before work, Day through the
// afternoon, Evening for the deep block, Wind-down at night. Times are sensible
// defaults for now (easy to make user-editable later).
export const DAY_BLOCKS: DayBlock[] = [
  { key: 'morning', label: 'Morning', startHour: 5 },
  { key: 'day', label: 'Day', startHour: 11 },
  { key: 'evening', label: 'Evening', startHour: 17 },
  { key: 'night', label: 'Wind-down', startHour: 22 },
];

// Which window each attribute's daily quest sits in by default. Life-friendly:
// centre the morning (a short sit), keep the day light (a nudge or a message,
// with physical training slotting into the afternoon), save the focused work —
// reading, craft, creativity — for the evening.
const STAT_BLOCK: Partial<Record<StatKey, string>> = {
  SPI: 'morning',
  STR: 'day',
  CHA: 'day',
  WLT: 'day',
  INT: 'evening',
  CFT: 'evening',
  CRE: 'evening',
};

// Some quest variants name a time of day (e.g. "Evening Reflect", "Morning Pages")
// — honour that over the attribute's default window, so it lands where it belongs.
const TITLE_BLOCK: { match: RegExp; block: string }[] = [
  { match: /\b(night|bedtime|before bed|wind.?down)\b/i, block: 'night' },
  { match: /\b(evening|dusk|sunset)\b/i, block: 'evening' },
  { match: /\b(morning|sunrise|wake)\b/i, block: 'morning' },
  { match: /\b(midday|noon|lunch|afternoon)\b/i, block: 'day' },
];

// A slot whose window belongs to the slot itself rather than to its attribute.
// The index cards are Intelligence, which reads in the evening — but the pile is
// what the recall ladder brought back overnight, and a card answered before the
// day starts is a card answered. Its titles rotate, so this is keyed on the slot
// and beats both the title match and the attribute default.
const QUEST_BLOCK: Record<string, string> = {
  'd-recall': 'morning',
};

/** The window a quest sits in: its own if it has been given one, else whatever its
 * title says, else its attribute's default. */
export function blockOf(quest: { id?: string; stat: string; title?: string }): string {
  const own = QUEST_BLOCK[quest.id ?? ''];
  if (own) return own;
  for (const t of TITLE_BLOCK) if (t.match.test(quest.title ?? '')) return t.block;
  return STAT_BLOCK[quest.stat as StatKey] ?? 'day';
}

/** The block the given local hour falls in (pre-dawn hours belong to Wind-down). */
export function currentBlockKey(hour: number): string {
  let key = 'night';
  for (const b of DAY_BLOCKS) if (hour >= b.startHour) key = b.key;
  return key;
}
