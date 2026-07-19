import { QueryClient } from '@tanstack/react-query';

/**
 * The single React Query client for all server-fetched state (body, insights,
 * avatar, …). Server data lives here — cached, deduped, refetched on focus —
 * while genuinely-client state (connection creds, toasts, notices, in-flight
 * upload/capture progress) stays in Zustand. That split is the centralised
 * pattern: one place asks the server, one place holds UI state.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // The app is same-origin with its always-on server; a failed fetch is
      // almost always "offline", so don't hammer it with retries.
      retry: 1,
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});
