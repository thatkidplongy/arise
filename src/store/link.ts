import { useSystem } from './useSystem';

/** The server URL + token, read fresh from the connection store — the single
 * place every other store (body, avatar, motivation) gets its link details. */
export function link() {
  const { serverUrl, apiToken } = useSystem.getState();
  return { serverUrl, apiToken };
}
