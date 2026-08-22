/** How long a note may be, per surface — these mirror the backend's own caps in
 * backend/app/schemas.py, so the editor stops you at the limit rather than letting
 * the server quietly trim (quest notes) or reject (learnings) what you wrote. */
export const QUEST_NOTE_MAX = 2000;
export const LEARNING_NOTE_MAX = 4000;
export const JOURNAL_NOTE_MAX = 5000;
