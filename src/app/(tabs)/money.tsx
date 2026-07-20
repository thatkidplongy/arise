import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { MoneyTracker } from '@/components/MoneyTracker';
import { Screen } from '@/components/Screen';
import { useSystem } from '@/store/useSystem';

/** The money log on its own screen, reached from the You hub — logs in/out with a
 * note and shows today's + this-week's totals. The wealth daily points here. */
export default function MoneyScreen() {
  const state = useSystem((s) => s.state);
  return (
    <Screen>
      <BackLink />
      {state ? <MoneyTracker money={state.money} /> : <ConnectionPanel />}
    </Screen>
  );
}
