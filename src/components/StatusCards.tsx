import { ChecklistPanel } from '@/components/ChecklistPanel';
import { useSystem } from '@/store/useSystem';

/** A checkable to-do list — only what's still open. Ticking an item moves it to the
 * You tab's Completed record (where it can be undone), so it leaves this list. */
export function Reminders({ items }: { items: { id: string; text: string; done: boolean }[] }) {
  const addReminder = useSystem((s) => s.addReminder);
  const toggleReminder = useSystem((s) => s.toggleReminder);
  const removeReminder = useSystem((s) => s.removeReminder);
  const open = items.filter((r) => !r.done);

  return (
    <ChecklistPanel
      title="To-do"
      sub={open.length ? `${open.length} left` : undefined}
      items={open.map((r) => ({ id: r.id, label: r.text, checked: false }))}
      placeholder="Add a to-do…"
      emptyHint="Nothing to do right now. Add a line, or enjoy the clear list."
      onAdd={(t) => void addReminder(t)}
      onToggle={(id, done) => void toggleReminder(id, done)}
      onRemove={(id) => void removeReminder(id)}
    />
  );
}
