/** How long a note may be, per surface — these mirror the caps named in
 * backend/app/limits.py, so the editor stops you at the limit rather than letting
 * the server quietly trim (quest notes) or reject (learnings) what you wrote.
 *
 * Kept by hand: Python can't be imported from here. Change a number there and
 * change it here — limits.py is the one that decides. */
export const QUEST_NOTE_MAX = 2000; // limits.QUEST_NOTE
export const LEARNING_NOTE_MAX = 4000; // limits.LEARNING_NOTE
export const JOURNAL_NOTE_MAX = 5000; // limits.JOURNAL_ENTRY
