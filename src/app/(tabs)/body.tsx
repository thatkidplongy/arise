import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { FoodPanel } from '@/components/Food/FoodPanel';
import { GroceryPanel } from '@/components/GroceryPanel';
import { Screen } from '@/components/Screen';
import { ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { dateKey } from '@/lib/dates';
import { useBody } from '@/query/useBody';

export default function FoodScreen() {
  const today = dateKey();
  // The day being looked at. A plate you forgot at lunch is still worth logging
  // at midnight, so the screen can walk back — the log day, not the clock, is
  // what everything here is keyed on.
  const [day, setDay] = useState(today);
  const { body, refetch } = useBody(day);

  // Refetch whenever the tab comes into focus, so it's fresh without a manual pull.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <Screen>
      <ScreenTitle>Food</ScreenTitle>
      <ScreenBlurb>Hands, not grams — eat with intention, don’t punish.</ScreenBlurb>
      {body ? (
        <>
          <FoodPanel day={day} today={today} onDay={setDay} />
          <GroceryPanel />
        </>
      ) : (
        <ConnectionPanel />
      )}
    </Screen>
  );
}
