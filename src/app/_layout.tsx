// Imported per cut, not from the package root: the root index requires every weight
// and italic, and a static web export then ships all fourteen files for the three
// the app actually loads.
import { Caprasimo_400Regular } from '@expo-google-fonts/caprasimo/400Regular';
import { Figtree_400Regular } from '@expo-google-fonts/figtree/400Regular';
import { Figtree_600SemiBold } from '@expo-google-fonts/figtree/600SemiBold';
import { Figtree_700Bold } from '@expo-google-fonts/figtree/700Bold';
import { QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';

import { SystemNoticeHost } from '@/components/SystemNotice';
import { ToastHost } from '@/components/Toast';
import { startAutoUpdate } from '@/lib/autoUpdate';
import { queryClient } from '@/query/client';
import { useSystem } from '@/store/useSystem';
import { surface, text } from '@/theme';

// Hold the splash until Caprasimo and Figtree are in memory — the whole type
// system is those two faces, so a frame drawn without them is the wrong app.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Caprasimo_400Regular,
    Figtree_400Regular,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

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

  useEffect(() => {
    // A font that failed to fetch still lets the app through — the fallback stack
    // is ugly, not broken, and being stuck on a splash screen is worse.
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <QueryClientProvider client={queryClient}>
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
    </QueryClientProvider>
  );
}
