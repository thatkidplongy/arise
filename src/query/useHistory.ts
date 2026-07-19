import { useQuery } from '@tanstack/react-query';

import { api } from '@/lib/api';

import { authed } from './authed';
import { qk } from './keys';

/** The dated log of finished quests, for the You → History screen. Read-only
 * server state, so it's a plain query; it refetches when the screen mounts, which
 * is enough to stay current after completing quests elsewhere. */
export function useHistory() {
  const query = useQuery({
    queryKey: qk.history,
    queryFn: () => authed((b, t) => api.getHistory(b, t)),
  });
  return { history: query.data ?? [], loading: query.isPending };
}
