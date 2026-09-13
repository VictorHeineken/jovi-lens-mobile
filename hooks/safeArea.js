import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Every screen used to hardcode `pt-14` (56px) as a status-bar offset. That
// number is wrong on both ends: Android reports a ~24-28px inset, so 56px
// wasted half a line of vertical space, while an iPhone with a Dynamic Island
// reports ~59px and had its content clipped under the island.
//
// expo-router already wraps the app in react-native-safe-area-context's
// SafeAreaProvider (see expo-router/build/ExpoRoot.js), so the hook works with
// no extra setup. NativeWind merges an inline `style` with the className-derived
// styles, so callers keep their Tailwind classes and pass only this value
// through `style` / `contentContainerStyle`.
const DEFAULT_GAP = 12;

// Returns the device's top safe-area inset ALREADY PLUS `gap` — not the raw
// inset. Callers assign the result straight to `paddingTop` (or `top` on an
// absolutely positioned control), so there is nothing left to add at the call
// site. Pass a smaller gap for chrome floating over full-bleed content.
export function useTopInset(gap = DEFAULT_GAP) {
  return useSafeAreaInsets().top + gap;
}

// The bottom counterpart, for content that is not inside the tab navigator —
// the full-screen modals. React Native's Android Modal is its own dialog
// window and, with edge-to-edge on (Expo SDK 57 default), it draws under the
// navigation/gesture bar. A fixed `pb-10` (40px) is entirely swallowed by a
// ~48px gesture inset, clipping whatever sits at the bottom of the sheet.
// Screens inside the tab navigator do NOT need this: react-navigation already
// pads them for the tab bar.
export function useBottomInset(gap = DEFAULT_GAP) {
  return useSafeAreaInsets().bottom + gap;
}
