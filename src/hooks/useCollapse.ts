import { useState } from 'react';

/** The open/closed state machine shared by every collapsible surface (SystemPanel,
 * DataTable). `enabled` is whether collapsing is possible at all (e.g. there's a
 * header to tap); when it's false the body is always open. State is per-session. */
export function useCollapse(enabled: boolean, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return {
    open: !enabled || !collapsed,
    toggle: () => setCollapsed((c) => !c),
  };
}
