import type { ApiInsight, ApiRecall } from '@/lib/api';

/**
 * One thing to meet again: a highlight the schedule says is due, or a line from a
 * tips capture.
 *
 * One flat sequence rather than two piles, because the screen shows one at a time
 * and taps through them — cycling wants an order, not categories.
 */
export type BringBack =
  | { kind: 'recall'; id: string; item: ApiRecall }
  | { kind: 'tip'; id: string; text: string; source: string; action: boolean };

/**
 * Everything due, then the tips library.
 *
 * The order is the point: a due highlight is due today and grading it is what moves
 * the schedule, where a tip is only ever there to be read again. Tips first would let
 * browsing quietly replace the work.
 *
 * Motivation captures are deliberately absent — their quotes and takeaways feed the
 * daily line on Status, and having them turn up here too would put the same content
 * in two places.
 */
export function buildBringBack(recall: ApiRecall[], insights: ApiInsight[]): BringBack[] {
  const out: BringBack[] = recall.map((item) => ({ kind: 'recall', id: item.id, item }));
  for (const i of insights) {
    if (i.kind !== 'tips') continue;
    // Takeaways are the ideas, steps are what to do about them — both worth meeting
    // again, flagged apart so the screen can say which it's showing. Ids are prefixed
    // by the capture so two captures can't collide as list keys.
    i.takeaways.forEach((text, n) => out.push({ kind: 'tip', id: `${i.id}-t${n}`, text, source: i.title, action: false }));
    i.steps.forEach((text, n) => out.push({ kind: 'tip', id: `${i.id}-s${n}`, text, source: i.title, action: true }));
  }
  return out;
}
