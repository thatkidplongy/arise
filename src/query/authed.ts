import { link } from '@/store/link';

/** Run a server call with the current link creds — the one-liner every query and
 * mutation shares, so none of them re-spell "read serverUrl/token, then call". */
export function authed<T>(fn: (base: string, token: string) => T): T {
  const { serverUrl, apiToken } = link();
  return fn(serverUrl, apiToken);
}
