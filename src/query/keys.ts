/** Query-key factory — one place that names every server resource, so cache
 * reads, writes and invalidations can't drift out of sync via stray strings. */
export const qk = {
  avatar: ['avatar'] as const,
  body: (day: string) => ['body', day] as const,
  insights: ['insights'] as const,
  state: (day: string) => ['state', day] as const,
};
