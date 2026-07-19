import { Platform } from 'react-native';

/**
 * Silent auto-update (web/PWA only).
 *
 * New screens and behavior ship inside the JavaScript bundle, and a data refresh
 * (pull-to-refresh) doesn't reload code — so without this, the app keeps running
 * an old build until a manual hard-refresh. This checks the server's current build
 * id on open and, if it differs from what's running, reloads once to pick it up.
 * No prompt, no tapping. It won't reload while you're typing, and a session guard
 * prevents any reload loop if a fetch of the new bundle doesn't take.
 */

const RELOADED_KEY = 'arise:reloadedFor';

/** The content-hashed entry bundle this page actually loaded, read from the DOM. */
function runningBuild(): string | null {
  if (typeof document === 'undefined') return null;
  for (const s of Array.from(document.querySelectorAll('script[src]'))) {
    const m = (s.getAttribute('src') || '').match(/entry-[a-f0-9]+\.js/);
    if (m) return m[0];
  }
  return null;
}

/** True while a text field is focused — don't yank the bundle out mid-entry. */
function isEditing(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
}

async function check(): Promise<void> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  const running = runningBuild();
  if (!running) return;

  let build = '';
  try {
    const res = await fetch('/version', { cache: 'no-store' });
    build = (await res.json())?.build ?? '';
  } catch {
    return; // offline or unreachable — try again next time
  }
  if (!build || build === running || isEditing()) return;

  try {
    // If we already tried reloading to this exact build and it didn't take (a
    // stubbornly cached shell), don't loop — one attempt is enough.
    if (window.sessionStorage?.getItem(RELOADED_KEY) === build) return;
    window.sessionStorage?.setItem(RELOADED_KEY, build);
  } catch {
    // sessionStorage unavailable (private mode) — proceed without the guard.
  }

  // A version query forces a fresh document fetch, defeating a cached shell.
  const url = new URL(window.location.href);
  url.searchParams.set('v', build);
  window.location.replace(url.toString());
}

let installed = false;

/** Start watching for new builds: once on load, and whenever the app is refocused. */
export function startAutoUpdate(): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || installed) return;
  installed = true;
  void check();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void check();
  });
}
