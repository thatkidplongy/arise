/** Pesos as the app shows them — no trailing centavos unless there are any. */
export function peso(n: number): string {
  return `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}
