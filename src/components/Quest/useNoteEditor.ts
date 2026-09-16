import { useState } from 'react';

/** What the editor is currently open on: a fresh entry answering a step, or an
 * edit of one already saved. `null` when it's closed. */
type Editing =
  | { kind: 'step'; step: number; prompt: string; initial: '' }
  | { kind: 'saved'; id: string; prompt: string; initial: string };

/**
 * The quest note editor's open/closed state.
 *
 * Five separate `useState`s in the card before this — open, prompt, initial text,
 * the id being edited, and the step waiting on it — of which only certain
 * combinations are ever meaningful: an id and a step are mutually exclusive, and
 * both are meaningless while it's closed. One nullable value can't hold an
 * impossible combination, so the branch in `save` reads off the value rather than
 * off which of two ids happens to be set.
 *
 * The saving itself stays with the caller: what a saved note does next (log it,
 * then tick the step that asked for it) is the quest's business, not the modal's.
 */
export function useNoteEditor() {
  const [editing, setEditing] = useState<Editing | null>(null);

  return {
    editing,
    visible: editing !== null,
    prompt: editing?.prompt ?? '',
    initial: editing?.initial ?? '',
    /** Answer a write-step: a blank sheet, prompted with the step's own words. */
    openForStep: (step: number, prompt: string) => setEditing({ kind: 'step', step, prompt, initial: '' }),
    /** Reopen something already written. */
    openForSaved: (note: { id: string; text: string }) =>
      setEditing({ kind: 'saved', id: note.id, prompt: 'Edit your entry', initial: note.text }),
    close: () => setEditing(null),
  };
}
