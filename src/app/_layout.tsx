import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { SystemNoticeHost } from '@/components/SystemNotice';
import { ToastHost } from '@/components/Toast';
import { startAutoUpdate } from '@/lib/autoUpdate';
import { useSystem } from '@/store/useSystem';
import { surface, text } from '@/theme';

export default function RootLayout() {
  // First contact with the System server, after the persisted settings
  // have been rehydrated from storage.
  useEffect(() => {
    // Silently pick up a newer web build on open (web/PWA only; no-op elsewhere).
    startAutoUpdate();
    if (useSystem.persist.hasHydrated()) {
      void useSystem.getState().refresh();
      return;
    }
    const unsub = useSystem.persist.onFinishHydration(() => {
      void useSystem.getState().refresh();
    });
    return unsub;
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: surface.base }}>
      <StatusBar style="dark" />
      <ThemeProvider
        value={{
          ...DefaultTheme,
          dark: false,
          colors: {
            ...DefaultTheme.colors,
            background: surface.base,
            card: surface.base,
            text: text.primary,
            border: surface.hairline,
            primary: text.primary,
          },
        }}
      >
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: surface.base },
          }}
        />
      </ThemeProvider>
      <ToastHost />
      <SystemNoticeHost />
    </View>
  );
}
