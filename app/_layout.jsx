import '../global.css';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppDataProvider } from '../context/AppDataContext.jsx';
import { loadByok, refresh } from '../services/aiAccess.js';
import { isDemoMode } from '../services/env.js';
import { ensurePrepared, integrityAvailable } from '../services/integrity.js';

export default function RootLayout() {
  useEffect(() => {
    if (isDemoMode()) return undefined;
    // Warm up the Play Integrity token provider; failures are retried per request.
    if (integrityAvailable()) ensurePrepared().catch(() => {});
    loadByok();
    refresh();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => subscription.remove();
  }, []);

  return (
    <AppDataProvider>
      <StatusBar style="auto" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="history" options={{ headerShown: true, title: 'Histórico', presentation: 'card' }} />
      </Stack>
    </AppDataProvider>
  );
}
