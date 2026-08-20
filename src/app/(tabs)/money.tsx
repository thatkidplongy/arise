import { BackLink } from '@/components/BackLink';
import { BudgetWorksheet } from '@/components/BudgetWorksheet';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { LogMoney } from '@/components/LogMoney';
import { MoneyTracker } from '@/components/MoneyTracker';
import { Screen } from '@/components/Screen';
import { useSystem } from '@/store/useSystem';

/** The money screen, reached from the You hub. The 50/30/20 plan comes first — the
 * rule you're aiming at — then the form for anything the plan didn't predict, then
 * the log (balance, chart) as what actually happened against that plan. The wealth
 * daily points here. */
export default function MoneyScreen() {
  const state = useSystem((s) => s.state);
  return (
    <Screen>
      <BackLink />
      {state ? (
        <>
          <BudgetWorksheet budget={state.budget} />
          <LogMoney />
          <MoneyTracker money={state.money} />
        </>
      ) : (
        <ConnectionPanel />
      )}
    </Screen>
  );
}
