import type { ApiInsight, ApiRecall } from '@/lib/api';

/** One thing to bring back: a scheduled highlight, or a line from a tips capture. */
export type BringBack =
  | { kind: 'recall'; id: string; item: ApiRecall }
  | { kind: 'tip'; id: string; text: string; source: string; action: boolean };

/** Scheduled highlights first, then the tips library.
 *
 * The order is the point: recall items are due today and grading them is what moves
 * the schedule, where a tip is only ever there to be read again. Putting the tips
 * first would let browsing quietly replace the work. */
export function buildBringBack(recall: ApiRecall[], insights: ApiInsight[]): BringBack[] {
  const out: BringBack[] = recall.map((item) => ({ kind: 'recall', id: item.id, item }));
  for (const i of insights) {
    if (i.kind !== 'tips') continue;
    // Takeaways are the ideas, steps are what to do about them — both worth meeting
    // again, and flagged apart so the block can say which it's showing.
    i.takeaways.forEach((text, n) => out.push({ kind: 'tip', id: `${i.id}-t${n}`, text, source: i.title, action: false }));
    i.steps.forEach((text, n) => out.push({ kind: 'tip', id: `${i.id}-s${n}`, text, source: i.title, action: true }));
  }
  return out;
}
