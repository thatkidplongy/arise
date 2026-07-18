import { create } from 'zustand';

import { api, type ApiInsight } from '@/lib/api';

import { link } from './link';
import { useSystem } from './useSystem';

/** A capture in flight (or one that failed) — shown as a live card in the list. */
export interface PendingCapture {
  tempId: string;
  url: string;
  status: 'working' | 'error';
  error?: string;
}

/**
 * The Inspire tab — captured, distilled videos — lives in its own store, fetched
 * from /insights on demand. Captures run in the BACKGROUND here (not on the
 * screen): `add` returns immediately and the work continues in `pending`, so you
 * can leave the tab or queue several at once and each card fills itself in when
 * ready. The daily pull-quote on Status arrives via the main /state payload; we
 * refresh useSystem after a capture lands so it stays in sync.
 * Connection settings (server URL + token) are borrowed from useSystem.
 */
interface MotivationStore {
  insights: ApiInsight[];
  pending: PendingCapture[];
  loaded: boolean;
  loading: boolean;
  error: string | null;

  fetch: () => Promise<void>;
  add: (url: string) => void; // fire-and-forget; progress lives on `pending`
  retry: (tempId: string) => void;
  dismiss: (tempId: string) => void;
  remove: (id: string) => Promise<void>;
}

/** Pull the server's human message out of a thrown request error. */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/"detail"\s*:\s*"([^"]+)"/);
  if (m) return m[1];
  return 'Couldn’t capture that — check the link and your connection, then try again.';
}

let seq = 0;

export const useMotivation = create<MotivationStore>((set, get) => {
  // Runs a capture in the background: its pending card shows a spinner until this
  // resolves, then it's swapped for the finished insight (or marked with an error
  // + retry). Lives in the store, not the screen, so it survives navigating away.
  const run = async (tempId: string, url: string) => {
    const { serverUrl, apiToken } = link();
    try {
      const insight = await api.addInsight(serverUrl, apiToken, url);
      set((s) => ({
        // Dedupe by id: if this video was already captured (the backend returns
        // the existing insight), move it to the top rather than listing it twice.
        insights: [insight, ...s.insights.filter((i) => i.id !== insight.id)],
        pending: s.pending.filter((p) => p.tempId !== tempId),
        loaded: true,
      }));
      void useSystem.getState().refresh(); // the new quote can now surface on Status
    } catch (e) {
      const error = friendlyError(e);
      set((s) => ({
        pending: s.pending.map((p) => (p.tempId === tempId ? { ...p, status: 'error', error } : p)),
      }));
    }
  };

  return {
    insights: [],
    pending: [],
    loaded: false,
    loading: false,
    error: null,

    fetch: async () => {
      const { serverUrl, apiToken } = link();
      set({ loading: true });
      try {
        const insights = await api.getInsights(serverUrl, apiToken);
        set({ insights, loaded: true, loading: false, error: null });
      } catch {
        set({ loading: false, error: 'Could not reach the System server.' });
      }
    },

    add: (url) => {
      const tempId = `pending-${++seq}`;
      set((s) => ({ pending: [{ tempId, url, status: 'working' as const }, ...s.pending] }));
      void run(tempId, url);
    },

    retry: (tempId) => {
      const p = get().pending.find((x) => x.tempId === tempId);
      if (!p) return;
      set((s) => ({
        pending: s.pending.map((x) =>
          x.tempId === tempId ? { ...x, status: 'working' as const, error: undefined } : x,
        ),
      }));
      void run(tempId, p.url);
    },

    dismiss: (tempId) => set((s) => ({ pending: s.pending.filter((x) => x.tempId !== tempId) })),

    remove: async (id) => {
      const { serverUrl, apiToken } = link();
      const insights = await api.removeInsight(serverUrl, apiToken, id);
      set({ insights });
      void useSystem.getState().refresh();
    },
  };
});
