import { useSystemStore } from './useSystemStore';

/** The server URL + token, read fresh from the connection store — the single
 * place every other store/query (body, avatar, insights, captures) gets its
 * link details. Creds live in the Zustand store regardless of which core
 * backend is active, so this is stable across the USE_RQ_CORE flag. */
export function link() {
  const { serverUrl, apiToken } = useSystemStore.getState();
  return { serverUrl, apiToken };
}
