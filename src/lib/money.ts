/** Pesos as the app shows them — no trailing centavos unless there are any.
 *
 * A negative amount reads −₱20,900, with the sign ahead of the symbol rather than
 * between it and the digits. `toLocaleString` would give "₱-20,900", which put the
 * balance headline and the tracker's net figure in two different formats; the sign
 * lives here so every caller agrees. U+2212 MINUS, not a hyphen — it lines up with
 * the digits at these weights.
 */
export function peso(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}₱${Math.abs(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
