import type { ApiLearning, ApiStudy } from '@/lib/api';

/**
 * The rules the study card shares with the log beneath it. Pure, so they're tested
 * here rather than inferred from the card's behaviour.
 *
 * The cards draw three subjects — Japanese and drawing taking turns every day, system
 * design Mon/Wed/Fri — and the two things that differ per subject are what a sitting
 * is filed as and which of today's logs belong to it.
 */

/** What's open in front of you: the source you picked (Craft), or the step the plan
 * is holding (the two walks). */
export function openPieceOf(study: ApiStudy): string {
  return study.subject === 'craft' ? study.source : study.piece;
}

/** What a sitting is filed as.
 *
 * Only Craft logs as Notion, and that matters beyond a label: a log whose kind is
 * 'notion' and whose source matches the open piece is what advances the system-design
 * plan (see `advance_craft_on_log`). Filing a kana row that way would march it on. */
export function studyKindOf(study: ApiStudy): 'notion' | 'other' {
  return study.subject === 'craft' ? 'notion' : 'other';
}

/** Whether one of today's logs belongs to this card.
 *
 * Craft counts any Notion sitting, because its source is a page you picked and the
 * Learn capture is where those land. The walks name their own step, so theirs is a
 * sitting logged against the step being held. */
export function isSittingFor(entry: ApiLearning, study: ApiStudy): boolean {
  if (study.subject === 'craft') return entry.kind === 'notion';
  return entry.kind === studyKindOf(study) && entry.source === study.piece;
}
