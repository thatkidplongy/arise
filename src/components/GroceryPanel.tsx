import { ChecklistPanel } from '@/components/ChecklistPanel';
import { useSystem } from '@/store/useSystem';

/** A plain grocery list — only what's still to buy. Ticking an item moves it to the
 * You tab's Completed record (where it can be undone), so it leaves this list. */
export function GroceryPanel() {
  const items = useSystem((s) => s.state?.grocery ?? []);
  const addGrocery = useSystem((s) => s.addGrocery);
  const toggleGrocery = useSystem((s) => s.toggleGrocery);
  const removeGrocery = useSystem((s) => s.removeGrocery);
  const toBuy = items.filter((g) => !g.bought);

  return (
    <ChecklistPanel
      title="Grocery list"
      sub={toBuy.length ? `${toBuy.length} to buy` : undefined}
      items={toBuy.map((g) => ({ id: g.id, label: g.name, checked: false }))}
      placeholder="Add an item…"
      emptyHint="Nothing to buy right now. Add what you need."
      maxLength={120}
      onAdd={(t) => void addGrocery(t)}
      onToggle={(id, bought) => void toggleGrocery(id, bought)}
      onRemove={(id) => void removeGrocery(id)}
    />
  );
}
