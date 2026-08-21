/**
 * Which of a long list is on screen and which is held back — the arithmetic behind
 * every "5 shown, 10 more" fold in the app.
 *
 * Pure and separate from the hook that holds the open/closed flag, because the part
 * worth getting wrong is here: the `visible + 1` boundary, and keeping `shown` and
 * `rest` two halves of the same list rather than two independently sliced ones.
 */
export function foldItems<T>(
  items: readonly T[],
  visible: number,
  expanded: boolean,
): { shown: readonly T[]; rest: readonly T[]; folds: boolean } {
  // +1: hiding a single row saves no space and costs a tap to get back.
  const folds = items.length > visible + 1;
  const cut = expanded || !folds ? items.length : visible;
  return { shown: items.slice(0, cut), rest: items.slice(cut), folds };
}
