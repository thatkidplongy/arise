import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

import { ConnectionPanel } from '@/components/ConnectionPanel';
import { GroceryPanel } from '@/components/GroceryPanel';
import { NutritionPanel } from '@/components/NutritionPanel';
import { Screen } from '@/components/Screen';
import { ScreenBlurb, ScreenTitle } from '@/components/ui/Card';
import { useBody } from '@/query/useBody';

export default function FoodScreen() {
  const { body, refetch } = useBody();

  // Refetch whenever the tab comes into focus, so it's fresh without a manual pull.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  return (
    <Screen>
      <ScreenTitle>Food</ScreenTitle>
      <ScreenBlurb>Eat with intention — nourish, don’t punish.</ScreenBlurb>
      {body ? (
        <>
          <NutritionPanel />
          <GroceryPanel />
        </>
      ) : (
        <ConnectionPanel />
      )}
    </Screen>
  );
}

