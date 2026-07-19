import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api, type ApiInsight } from '@/lib/api';
import { link } from '@/store/link';
import { useSystem } from '@/store/useSystem';

import { queryClient } from './client';
import { qk } from './keys';

/** Shared query options so the hook and the imperative loader agree. */
export function insightsQuery() {
  return {
    queryKey: qk.insights,
    queryFn: async () => {
      const { serverUrl, apiToken } = link();
      return api.getInsights(serverUrl, apiToken);
    },
  };
}

/** Imperative lazy-load — used by the Status shuffle, which isn't a component
 * render. Returns the cached list or fetches it once. */
export function fetchInsights(): Promise<ApiInsight[]> {
  return queryClient.ensureQueryData(insightsQuery());
}

/** The Inspire library (captured, distilled videos) as a query, plus removal.
 * New captures are written into this cache by the background capture runner in
 * useCaptures — the capture is client-side work; its result is server state. */
export function useInsights() {
  const qc = useQueryClient();
  const query = useQuery(insightsQuery());

  const removeMut = useMutation({
    mutationFn: (id: string) => {
      const { serverUrl, apiToken } = link();
      return api.removeInsight(serverUrl, apiToken, id);
    },
    onSuccess: (insights) => {
      qc.setQueryData(qk.insights, insights);
      void useSystem.getState().refresh(); // a removed quote drops off Status too
    },
  });

  return {
    insights: query.data ?? [],
    loaded: query.isSuccess, // "has fetched at least once" — gates the empty state
    remove: (id: string) => removeMut.mutateAsync(id),
  };
}
