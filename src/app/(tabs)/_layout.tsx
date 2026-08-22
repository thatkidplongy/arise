import { Tabs } from 'expo-router';

import { AriseTabBar } from '@/components/AriseTabBar';
import { surface } from '@/theme';

export default function TabsLayout() {
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
      <Tabs.Screen name="inspire" options={{ title: 'Fuel' }} />
      <Tabs.Screen name="you" options={{ title: 'You' }} />

      {/* Reachable from the You hub (and deep links), but kept off the tab bar so
          it stays at a clean five. `href: null` hides the button, not the route —
          Food still works, and everything logged there is untouched. */}
      <Tabs.Screen name="body" options={{ href: null, title: 'Food' }} />
      <Tabs.Screen name="focus" options={{ href: null, title: 'Focus' }} />
      <Tabs.Screen name="achievements" options={{ href: null, title: 'Achievements' }} />
      <Tabs.Screen name="bosses" options={{ href: null, title: 'Boss fights' }} />
      <Tabs.Screen name="recap" options={{ href: null, title: 'Recap' }} />
      <Tabs.Screen name="history" options={{ href: null, title: 'History' }} />
      <Tabs.Screen name="journal" options={{ href: null, title: 'Journal' }} />
      <Tabs.Screen name="entry" options={{ href: null, title: 'Entry' }} />
      <Tabs.Screen name="money" options={{ href: null, title: 'Money' }} />
      <Tabs.Screen name="skincare" options={{ href: null, title: 'Skincare' }} />
      <Tabs.Screen name="settings" options={{ href: null, title: 'Settings' }} />
    </Tabs>
  );
}
