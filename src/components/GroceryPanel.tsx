import { ChecklistPanel } from '@/components/ChecklistPanel';
import { useSystem } from '@/store/useSystem';

/** A plain grocery list — add what you need, tick it off once it's in the basket.
 * Bought items stay (struck through) as a record; × removes for good. */
export function GroceryPanel() {
  const items = useSystem((s) => s.state?.grocery ?? []);
  const addGrocery = useSystem((s) => s.addGrocery);
  const toggleGrocery = useSystem((s) => s.toggleGrocery);
  const removeGrocery = useSystem((s) => s.removeGrocery);
  const toBuy = items.filter((g) => !g.bought).length;

  return (
    <ChecklistPanel
      title="Grocery list"
      sub={items.length ? `${toBuy} to buy` : undefined}
      items={items.map((g) => ({ id: g.id, label: g.name, checked: g.bought }))}
      placeholder="Add an item…"
      emptyHint="Nothing on the list yet. Add what you need to buy."
      maxLength={120}
      onAdd={(t) => void addGrocery(t)}
      onToggle={(id, bought) => void toggleGrocery(id, bought)}
      onRemove={(id) => void removeGrocery(id)}
    />
  );
}
