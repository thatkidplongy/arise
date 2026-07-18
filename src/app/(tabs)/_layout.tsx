import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CONTENT_MAX_WIDTH } from '@/components/Screen';
import { accent, surface, text } from '@/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: surface.base },
        tabBarStyle: {
          backgroundColor: surface.card,
          borderTopColor: surface.hairline,
          borderTopWidth: 1,
          // Content area = height - paddingTop - paddingBottom = ~58px, enough
          // for a 24px icon + 16px label with slack. Extra bottom padding
          // clears the home indicator on device.
          height: 74 + insets.bottom,
          paddingTop: 8,
          paddingBottom: insets.bottom + 8,
          // On a wide browser, centre the bar in a column matching the page
          // rather than stretching the tabs across the whole window. No effect on
          // a phone (its width is already below the cap).
          width: '100%',
          maxWidth: CONTENT_MAX_WIDTH,
          alignSelf: 'center',
        },
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: text.faint,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', lineHeight: 16, marginTop: 3 },
        tabBarIconStyle: { marginTop: 2 },
      }}
    >
      {/* The five primary destinations. */}
      <Tabs.Screen
        name="index"
        options={{
          title: 'Status',
          tabBarIcon: ({ color }) => <Ionicons name="person-outline" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="quests"
        options={{
          title: 'Quests',
          tabBarIcon: ({ color }) => <Ionicons name="flash-outline" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="body"
        options={{
          title: 'Body',
          tabBarIcon: ({ color }) => <Ionicons name="body-outline" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="inspire"
        options={{
          title: 'Inspire',
          tabBarIcon: ({ color }) => <Ionicons name="sparkles-outline" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: 'You',
          tabBarIcon: ({ color }) => <Ionicons name="person-circle-outline" color={color} size={24} />,
        }}
      />

      {/* Reachable from the You hub (and deep links), but kept off the tab bar so
          it stays at a clean five. `href: null` hides the button, not the route. */}
      <Tabs.Screen name="focus" options={{ href: null, title: 'Focus' }} />
      <Tabs.Screen name="achievements" options={{ href: null, title: 'Achievements' }} />
      <Tabs.Screen name="settings" options={{ href: null, title: 'Settings' }} />
    </Tabs>
  );
}
