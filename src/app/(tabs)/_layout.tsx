import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
        },
        tabBarActiveTintColor: accent,
        tabBarInactiveTintColor: text.faint,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600', lineHeight: 16, marginTop: 3 },
        tabBarIconStyle: { marginTop: 2 },
      }}
    >
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
        name="achievements"
        options={{
          title: 'Achievements',
          tabBarIcon: ({ color }) => <Ionicons name="trophy-outline" color={color} size={24} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <Ionicons name="settings-outline" color={color} size={24} />,
        }}
      />
    </Tabs>
  );
}
