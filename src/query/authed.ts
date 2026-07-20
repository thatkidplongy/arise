import { createClient, type ApiClient } from '@/lib/api';
import { link } from '@/store/link';

/** Run a server call with the current link creds, as a ready-bound client — the
 * one-liner every query and mutation shares, so none of them re-spell "read
 * serverUrl/token, then call". */
export function authed<T>(fn: (client: ApiClient) => T): T {
  const { serverUrl, apiToken } = link();
  return fn(createClient(serverUrl, apiToken));
}
