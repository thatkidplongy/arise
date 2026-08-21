import { useState } from 'react';

import { foldItems } from '@/lib/fold';

/**
 * A long list showing its first `visible` rows until the reader asks for the rest.
 *
 * Not useCollapse: that hides a whole section behind its header, so nothing of it is
 * left on screen. Here the head of the list always shows — the fold only trims a
 * tail. State is per-session, same as useCollapse.
 */
export function useShowMore<T>(items: readonly T[], visible: number) {
  const [expanded, setExpanded] = useState(false);
  return {
    ...foldItems(items, visible, expanded),
    expanded,
    toggle: () => setExpanded((e) => !e),
  };
}
