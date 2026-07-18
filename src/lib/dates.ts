/** Local calendar day as 'YYYY-MM-DD' — sent with every API call, because the
 * phone knows what "today" means better than the server does. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
