/**
 * Mathison Mobile App - Root Layout
 * Uses Expo Router for navigation
 */

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { MathisonProvider } from '../src/hooks/useMathison';

export default function RootLayout() {
  return (
    <MathisonProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: {
            backgroundColor: '#1a1a2e',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </MathisonProvider>
  );
}
