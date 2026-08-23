import { useQuery } from '@tanstack/react-query';

import { type ApiRecall } from '@/lib/api';
import { dateKey } from '@/lib/dates';

import { authed } from './authed';
import { qk } from './keys';

/** The whole shelf — every highlight ever distilled, in the day's shuffled order.
 * The recall card browses this once the due handful runs out, so tapping keeps
 * meeting new material. Keyed by day because the server reshuffles each morning. */
export function useRecallLibrary(): ApiRecall[] {
  const day = dateKey();
  const query = useQuery({
    queryKey: qk.recallLibrary(day),
    queryFn: () => authed((c) => c.getRecallLibrary(day)),
  });
  return query.data ?? [];
}
