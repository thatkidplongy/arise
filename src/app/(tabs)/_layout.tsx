import { Redirect, Tabs } from 'expo-router';
import { useEffect, useState } from 'react';

import { AriseTabBar } from '@/components/AriseTabBar';
import { useSystem } from '@/store/useSystem';
import { surface } from '@/theme';

/**
 * Whether the persisted settings have come back from storage yet.
 *
 * Everything that reads `onboarded` has to wait for this. Before it's true the
 * flag is only the store's default — false — and acting on that sends someone
 * who onboarded months ago back through the first run, or blanks the route
 * during a static web export, where storage never answers at all.
 */
function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useSystem.persist.hasHydrated());
  useEffect(() => useSystem.persist.onFinishHydration(() => setHydrated(true)), []);
  return hydrated;
}

export default function TabsLayout() {
  const onboarded = useSystem((s) => s.onboarded);
  const hydrated = useHydrated();

  // The first run happens once, before the board is ever shown. It writes the flag
  // itself, so skipping it counts as having done it.
  if (hydrated && !onboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      tabBar={(props) => <AriseTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: surface.base },
      }}
    >
      {/* The five primary destinations. Icons live in AriseTabBar; screens set titles. */}
      <Tabs.Screen name="index" options={{ title: 'Status' }} />
      <Tabs.Screen name="quests" options={{ title: 'Quests' }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn' }} />
      <Tabs.Screen name="inspire" options={{ title: 'Ember' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />

      {/* Reachable from the You hub (and deep links), but kept off the tab bar so
          it stays at a clean five. `href: null` hides the button, not the route —
          Food still works, and everything logged there is untouched. */}
      <Tabs.Screen name="body" options={{ href: null, title: 'Food' }} />
      {/* Food's weekly view — the only screen that talks in calories, kept off the
          daily one on purpose (see components/Food/PlateCard). */}
      <Tabs.Screen name="trend" options={{ href: null, title: 'Food trend' }} />
      <Tabs.Screen name="focus" options={{ href: null, title: 'Focus' }} />
      <Tabs.Screen name="achievements" options={{ href: null, title: 'Achievements' }} />
      <Tabs.Screen name="bosses" options={{ href: null, title: 'Boss fights' }} />
      <Tabs.Screen name="recap" options={{ href: null, title: 'Recap' }} />
      <Tabs.Screen name="history" options={{ href: null, title: 'History' }} />
      <Tabs.Screen name="journal" options={{ href: null, title: 'Journal' }} />
      <Tabs.Screen name="entry" options={{ href: null, title: 'Entry' }} />
      <Tabs.Screen name="recall" options={{ href: null, title: 'Recall' }} />
      <Tabs.Screen name="money" options={{ href: null, title: 'Money' }} />
      <Tabs.Screen name="skincare" options={{ href: null, title: 'Skincare' }} />
      <Tabs.Screen name="settings" options={{ href: null, title: 'Settings' }} />
    </Tabs>
  );
}
