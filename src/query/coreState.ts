import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';
import { dateKey } from '@/lib/dates';
import { type SystemStore, useSystemStore } from '@/store/useSystemStore';

import { queryClient } from './client';
import { qk } from './keys';

// Once active, mirror the store's game `state` into the query cache, so the
// existing actions (which set the store) surface to React Query consumers.
let mirroring = false;
function startMirror() {
  if (mirroring) return;
  mirroring = true;
  useSystemStore.subscribe((s) => {
    if (s.state) queryClient.setQueryData(qk.state(dateKey()), s.state);
  });
}

/**
 * A React Query facade over the core game state — a drop-in for the Zustand
 * store (same selector call, `.getState()` and `.persist`), selected by
 * USE_RQ_CORE in useSystem.ts. The server `state` becomes a query, so it
 * refetches on focus/reconnect like the migrated Body/Inspire tabs; creds,
 * status, notices, toast and every action are reused verbatim from the Zustand
 * store, whose writes are mirrored into the cache. It's a fallback experiment:
 * flip the flag off to revert instantly.
 */
export function useSystemRQ<T>(selector: (s: SystemStore) => T): T {
  startMirror();
  const store = useSystemStore();
  const day = dateKey();
  const query = useQuery({
    queryKey: qk.state(day),
    queryFn: () => api.state(store.serverUrl, store.apiToken, day),
  });
  const merged: SystemStore = { ...store, state: query.data ?? store.state };
  return selector(merged);
}

// Imperative surface used across the app (link creds, .refresh(), .status) and
// by _layout for hydration — delegate to the store, which owns creds + persist.
useSystemRQ.getState = useSystemStore.getState;
useSystemRQ.persist = useSystemStore.persist;
