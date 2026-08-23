import { useState } from 'react';

/**
 * Which day bands are open. Today starts open — it's the question a day-banded list
 * exists to answer — and every earlier day starts as one line, so a month of history
 * stays scannable. State is per-session, like the app's other folds.
 */
export function useDayBands(today: string) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  return {
    isOpen: (day: string) => open[day] ?? day === today,
    toggle: (day: string) => setOpen((o) => ({ ...o, [day]: !(o[day] ?? day === today) })),
  };
}
