/** Parse a user-typed numeric string to a number, falling back (default 0) when
 * it's blank or not a finite number. Shared by the nutrition inputs. */
export function num(v: string, fallback = 0): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}
