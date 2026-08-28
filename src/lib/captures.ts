import type { ApiCaptureSweep, CaptureFailReason } from '@/lib/api';

/**
 * Pure reads over the failure ledger — the links pasted on Ember that never
 * distilled (see backend `insights.CaptureFailure`). Here rather than in the card
 * so the copy that has to stay honest about what a bounded sweep left behind is
 * testable without a renderer.
 */

/** What a kept link's card leads with. The row underneath carries the server's own
 * detail line, so these stay short and never repeat it. */
export const REASON_LABELS: Record<CaptureFailReason, string> = {
  no_key: 'Waiting on a key',
  no_speech: 'Nothing to distil',
  fetch_failed: 'Transcript didn’t come back',
  distill_failed: 'Distilling didn’t finish',
  failed: 'Didn’t come through',
};

export function describeAttempts(attempts: number): string {
  if (attempts <= 1) return 'Tried once';
  return `Tried ${attempts}×`;
}

/**
 * The outcome line after a sweep. A sweep is bounded server-side (SWEEP_MAX, and it
 * gives up once the blocker clearly hasn't cleared), so whatever it didn't reach has
 * to be said out loud — otherwise a list of twenty reads as finished after five.
 */
export function summariseSweep(sweep: ApiCaptureSweep): string {
  const parts: string[] = [];
  if (sweep.captured.length > 0) parts.push(`${sweep.captured.length} distilled`);
  if (sweep.failed > 0) parts.push(`${sweep.failed} still failing`);
  if (sweep.untried > 0) parts.push(`${sweep.untried} left to try`);
  if (parts.length === 0) return 'Nothing to try.';
  return `${parts.join(' · ')}.`;
}
