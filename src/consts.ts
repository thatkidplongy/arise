/** How long a note may be, per surface — these mirror the caps named in
 * backend/app/limits.py, so the editor can show you the limit coming rather than
 * letting the server quietly trim (quest notes, journal) or reject (learnings)
 * what you wrote.
 *
 * The order is deliberate: a quest note answers a written prompt and is where the
 * real thinking goes, so it gets the most room by a wide margin. A learning note
 * sits beside a source that carries most of the meaning, and a journal entry is a
 * day's worth rather than an essay.
 *
 * Kept by hand: Python can't be imported from here. Change a number there and
 * change it here — limits.py is the one that decides. */
export const QUEST_NOTE_MAX = 8000; // limits.QUEST_NOTE
export const LEARNING_NOTE_MAX = 3000; // limits.LEARNING_NOTE
export const JOURNAL_NOTE_MAX = 4000; // limits.JOURNAL_ENTRY

/** Where the note editors start showing the count. Below this you're nowhere near
 * the limit and a number on screen is just noise; above it, you get enough warning
 * to finish the thought and trim rather than discovering the cap by being stopped. */
export const NOTE_COUNT_FROM = 0.85;

/** Each attribute's content band, named as the path it is: Shu (follow the form
 * exactly), Ha (bend it), Ri (make it your own). Indexed by `ApiProgression.band`,
 * which `progression.band_for` derives from the level (two levels a stage). */
export const SHUHARI = ['Shu', 'Ha', 'Ri'] as const;

export function shuhariOf(band: number | undefined): string {
  return SHUHARI[Math.max(0, Math.min(band ?? 0, SHUHARI.length - 1))];
}
