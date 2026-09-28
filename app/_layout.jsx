import '../global.css';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppDataProvider } from '../context/AppDataContext.jsx';
import { loadByok, refresh } from '../services/aiAccess.js';
import { isDemoMode } from '../services/env.js';
import { ensurePrepared, integrityAvailable } from '../services/integrity.js';

// A tapped exam reminder opens that subject's studio (see app/(tabs)/notes.jsx).
// The notification's own date is the link stamp, so each reminder opens once
// and the same launch response is not consumed twice (see notes.jsx).
function openReminder(response) {
  const subject = response?.notification?.request?.content?.data?.subject;
  if (subject) router.push({ pathname: '/(tabs)/notes', params: { subject, t: String(response.notification.date || '') } });
}

export default function RootLayout() {
  useEffect(() => {
    Notifications.getLastNotificationResponseAsync().then(openReminder).catch(() => {});
    const subscription = Notifications.addNotificationResponseReceivedListener(openReminder);
    return () => subscription.remove();
  }, []);

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
      {/* The app is designed light-only (see app.json userInterfaceStyle), so the
          status bar is dark-on-light; "auto" drew white icons over white
          screens whenever the phone was in dark mode. The camera screen
          switches it to light while focused. */}
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </AppDataProvider>
  );
}

// expo-router shows this for any route below that throws while rendering.
export { default as ErrorBoundary } from '../components/ErrorScreen.jsx';
