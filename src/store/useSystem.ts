import { useSystemRQ } from '@/query/coreState';

import { useSystemStore } from './useSystemStore';

export { DEFAULT_SERVER_URL } from './useSystemStore';
export type { LinkStatus, SystemStore } from './useSystemStore';

/**
 * Which backend powers the core game state.
 *
 *   false → the Zustand store (the proven default, and the fallback).
 *   true  → the React Query facade (useSystemRQ) — a drop-in you can A/B against
 *           the Zustand one; `state` becomes a query that refetches on focus.
 *
 * Flip this, rebuild, reload to try the migrated core; flip it back to revert
 * instantly. Every component imports `useSystem` from here, so nothing else
 * changes. (Only the Zustand path is battle-tested; the RQ path is the trial.)
 */
export const USE_RQ_CORE: boolean = false;

export const useSystem: typeof useSystemStore = USE_RQ_CORE
  ? (useSystemRQ as unknown as typeof useSystemStore)
  : useSystemStore;
