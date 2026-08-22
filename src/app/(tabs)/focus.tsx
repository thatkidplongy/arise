
import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { FocusAreasCard } from '@/components/FocusAreasCard';
import { InterviewModeCard } from '@/components/InterviewModeCard';
import { Screen } from '@/components/Screen';
import { ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { useSystem } from '@/store/useSystem';

export default function FocusScreen() {
  const state = useSystem((s) => s.state);

  return (
    <Screen>
      <BackLink />
      <ScreenTitle>Focus</ScreenTitle>
      <ScreenBlurb>Shape how the System tailors your quests.</ScreenBlurb>
      {state ? (
        <>
          <FocusAreasCard />
          <InterviewModeCard />
        </>
      ) : (
        <ConnectionPanel />
      )}
    </Screen>
  );
}

