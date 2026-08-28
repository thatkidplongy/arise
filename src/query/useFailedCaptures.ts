import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { type ApiCaptureSweep, type ApiInsight } from '@/lib/api';
import { useSystem } from '@/store/useSystem';

import { authed } from './authed';
import { queryClient } from './client';
import { qk } from './keys';

/** Fold newly-landed captures into the library cache, newest first and deduped by
 * id — the same merge the background capture runner does (see useCaptures). */
function mergeCaptured(landed: ApiInsight[]): void {
  if (landed.length === 0) return;
  const ids = new Set(landed.map((i) => i.id));
  queryClient.setQueryData<ApiInsight[]>(qk.insights, (old) => [
    ...landed,
    ...(old ?? []).filter((i) => !ids.has(i.id)),
  ]);
  void useSystem.getState().refresh(); // a new quote can surface on Status
}

/** The links that never distilled, plus the three things you can do about them:
 * try one again, try them all (once the key's in or the quota has rolled), or give
 * up on one. The server keeps this list — that's the point of it, since the whole
 * reason a capture failed is usually something that outlives the app session. */
export function useFailedCaptures() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.failedCaptures,
    queryFn: () => authed((c) => c.getFailedCaptures()),
  });

  const retryMut = useMutation({
    mutationFn: (id: string) => authed((c) => c.retryFailedCapture(id)),
    onSuccess: (insight) => {
      mergeCaptured([insight]);
      void qc.invalidateQueries({ queryKey: qk.failedCaptures });
    },
    // A retry that fails again leaves the row (with one more attempt on it), so the
    // list still needs re-reading — the card's own copy may have changed.
    onError: () => qc.invalidateQueries({ queryKey: qk.failedCaptures }),
  });

  const sweepMut = useMutation({
    mutationFn: () => authed((c) => c.retryFailedCaptures()),
    onSuccess: (sweep: ApiCaptureSweep) => {
      mergeCaptured(sweep.captured);
      qc.setQueryData(qk.failedCaptures, sweep.remaining);
    },
    onError: () => qc.invalidateQueries({ queryKey: qk.failedCaptures }),
  });

  const forgetMut = useMutation({
    mutationFn: (id: string) => authed((c) => c.forgetFailedCapture(id)),
    onSuccess: (remaining) => qc.setQueryData(qk.failedCaptures, remaining),
  });

  return {
    failed: query.data ?? [],
    retry: (id: string) => retryMut.mutateAsync(id),
    retryingId: retryMut.isPending ? (retryMut.variables ?? null) : null,
    sweep: () => sweepMut.mutateAsync(),
    sweeping: sweepMut.isPending,
    lastSweep: sweepMut.data ?? null,
    forget: (id: string) => forgetMut.mutateAsync(id),
  };
}
