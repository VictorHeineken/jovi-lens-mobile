import '../global.css';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppDataProvider } from '../context/AppDataContext.jsx';

export default function RootLayout() {
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
