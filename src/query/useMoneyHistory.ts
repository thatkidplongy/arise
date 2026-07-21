import { useQuery } from '@tanstack/react-query';

import type { MoneyScope } from '@/lib/api';

import { authed } from './authed';
import { qk } from './keys';

/** One period of the money log (day / week / month), fetched on demand so /state
 * never carries the whole history. Keyed by scope + anchor day, so stepping
 * through periods caches each and stays snappy. */
export function useMoneyHistory(scope: MoneyScope, day: string) {
  const query = useQuery({
    queryKey: qk.money(scope, day),
    queryFn: () => authed((c) => c.getMoneyHistory(scope, day)),
  });
  return { history: query.data ?? null, loading: query.isPending };
}
