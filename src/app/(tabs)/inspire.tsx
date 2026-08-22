
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { MotivationPanel } from '@/components/MotivationPanel';
import { Screen } from '@/components/Screen';
import { ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { useSystem } from '@/store/useSystem';

export default function InspireScreen() {
  const state = useSystem((s) => s.state);

  return (
    <Screen>
      <ScreenTitle>Fuel</ScreenTitle>
      <ScreenBlurb>Keep what moved you. No XP here — this one sits outside the game.</ScreenBlurb>
      {state ? <MotivationPanel /> : <ConnectionPanel />}
    </Screen>
  );
}

