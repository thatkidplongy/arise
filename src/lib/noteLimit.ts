import { NOTE_COUNT_FROM } from '@/consts';

export type NoteCount =
  | { show: false }
  | { show: true; over: boolean; label: string };

/**
 * What the note editors should say about the room left, if anything.
 *
 * Both editors used to enforce their cap by silently refusing the next keystroke —
 * the one kind of failure with no explanation attached, since you don't discover
 * the limit, you discover the keyboard stopped working. So: quiet until the limit
 * is close enough to be worth planning around, then a count, then a plain statement
 * of how far over you are. Going over is a state you can see and fix, not a wall.
 *
 * `length` is the length of what would actually be *stored* — the Markdown, not the
 * styled text on screen — because that is what the cap applies to.
 */
export function noteCount(length: number, max: number): NoteCount {
  const over = length - max;
  if (over > 0) {
    return { show: true, over: true, label: `${over.toLocaleString()} over the limit — trim it to save` };
  }
  if (length < max * NOTE_COUNT_FROM) return { show: false };
  return { show: true, over: false, label: `${(max - length).toLocaleString()} characters left` };
}
