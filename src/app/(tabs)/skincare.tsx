import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { BackLink } from '@/components/BackLink';
import { ConnectionPanel } from '@/components/ConnectionPanel';
import { Screen } from '@/components/Screen';
import { SkincarePanel } from '@/components/SkincarePanel';
import { ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { useBody } from '@/query/useBody';

export default function SkincareScreen() {
  const { body, refetch } = useBody();

  // Refetch whenever the screen comes into focus, so it's fresh without a manual pull.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <Screen>
      <BackLink to="/you" />
      <ScreenTitle>Skincare</ScreenTitle>
      <ScreenBlurb>Your simple AM / PM routine — a small daily kindness.</ScreenBlurb>
      {body ? <SkincarePanel /> : <ConnectionPanel />}
    </Screen>
  );
}

