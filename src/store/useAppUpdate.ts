import { Platform } from 'react-native';
import { create } from 'zustand';

/**
 * "Is a newer build deployed?" — without ever reloading the page on its own.
 *
 * `EXPO_PUBLIC_ARISE_BUILD` is stamped into the bundle at export time (see
 * scripts/build-web.sh) and the same id is written to `dist/version.json`. The
 * running app therefore knows the build it booted with; polling version.json
 * tells it what's *currently* served. When they differ, a new build is live and
 * we surface a gentle "update" pill — the hard reload only happens on tap.
 *
 * Web-only and best-effort: in dev (no baked id) or offline it simply no-ops, so
 * it can never produce a false prompt.
 */
const RUNNING_BUILD = process.env.EXPO_PUBLIC_ARISE_BUILD ?? '';

interface AppUpdateStore {
  available: boolean;
  check: () => Promise<void>;
  reload: () => void;
}

export const useAppUpdate = create<AppUpdateStore>((set, get) => ({
  available: false,

  check: async () => {
    if (Platform.OS !== 'web' || !RUNNING_BUILD || get().available) return;
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = (await res.json()) as { build?: string };
      if (data.build && data.build !== RUNNING_BUILD) set({ available: true });
    } catch {
      // Offline or unreachable — leave the flag untouched and try again later.
    }
  },

  reload: () => {
    if (Platform.OS !== 'web') return;
    const loc = (globalThis as any).location;
    if (!loc) return;
    set({ available: false }); // hide the bar immediately, even before the reload paints
    // A plain reload() can serve a stale shell in an installed iOS PWA, which
    // would leave this prompt stuck. Navigating to a fresh, cache-busted URL
    // forces the browser to refetch index.html (and thus the new bundle). We keep
    // the current path so a deep route survives the update.
    loc.replace(`${loc.pathname}?u=${Date.now()}${loc.hash || ''}`);
  },
}));
