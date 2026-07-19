import { create } from 'zustand';

import { api, type ApiInsight, type InsightKind } from '@/lib/api';
import { queryClient } from '@/query/client';
import { qk } from '@/query/keys';

import { link } from './link';
import { useSystem } from './useSystem';

/** A capture in flight (or one that failed) — shown as a live card in the list. */
export interface PendingCapture {
  tempId: string;
  url: string;
  kind: InsightKind;
  status: 'working' | 'error';
  error?: string;
}

/**
 * Video captures are genuinely client-side work: `add` returns immediately and
 * the distillation runs in the BACKGROUND here, so you can leave the Inspire tab
 * or queue several at once. That transient `pending` list is why this stays a
 * Zustand store — the finished *insight* is server state, so it's written
 * straight into the React Query cache (useInsights) when the work lands.
 */
interface CaptureStore {
  pending: PendingCapture[];
  add: (url: string, kind: InsightKind) => void; // fire-and-forget
  retry: (tempId: string) => void;
  dismiss: (tempId: string) => void;
}

/** Pull the server's human message out of a thrown request error. */
function friendlyError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/"detail"\s*:\s*"([^"]+)"/);
  if (m) return m[1];
  return 'Couldn’t capture that — check the link and your connection, then try again.';
}

let seq = 0;

export const useCaptures = create<CaptureStore>((set, get) => {
  // Runs a capture in the background: the pending card spins until this resolves,
  // then the finished insight is merged into the query cache (or the card is
  // marked with an error + retry). Lives here, not in the screen, so it survives
  // navigating away.
  const run = async (tempId: string, url: string, kind: InsightKind) => {
    const { serverUrl, apiToken } = link();
    try {
      const insight = await api.addInsight(serverUrl, apiToken, url, kind);
      // Merge into the insights cache, deduped by id (a re-capture returns the
      // existing one — move it to the top rather than listing it twice).
      queryClient.setQueryData<ApiInsight[]>(qk.insights, (old) => [
        insight,
        ...(old ?? []).filter((i) => i.id !== insight.id),
      ]);
      set((s) => ({ pending: s.pending.filter((p) => p.tempId !== tempId) }));
      void useSystem.getState().refresh(); // the new quote can surface on Status
    } catch (e) {
      const error = friendlyError(e);
      set((s) => ({
        pending: s.pending.map((p) => (p.tempId === tempId ? { ...p, status: 'error', error } : p)),
      }));
    }
  };

  return {
    pending: [],

    add: (url, kind) => {
      const tempId = `pending-${++seq}`;
      set((s) => ({ pending: [{ tempId, url, kind, status: 'working' as const }, ...s.pending] }));
      void run(tempId, url, kind);
    },

    retry: (tempId) => {
      const p = get().pending.find((x) => x.tempId === tempId);
      if (!p) return;
      set((s) => ({
        pending: s.pending.map((x) =>
          x.tempId === tempId ? { ...x, status: 'working' as const, error: undefined } : x,
        ),
      }));
      void run(tempId, p.url, p.kind);
    },

    dismiss: (tempId) => set((s) => ({ pending: s.pending.filter((x) => x.tempId !== tempId) })),
  };
});
