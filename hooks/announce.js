import { useEffect, useRef } from 'react';
import { AccessibilityInfo } from 'react-native';

// Announces a transient status message to a screen reader whenever it changes.
// `accessibilityLiveRegion="polite"` looks like the natural fit here, but React
// Native's implementation is Android-only (see the @platform tag on that prop in
// react-native/Libraries/Components/View/ViewAccessibility.js) — on iOS it's a
// silent no-op, so a VoiceOver user never hears the message at all.
// AccessibilityInfo.announceForAccessibility() calls the matching native API on
// both platforms, so it is used here instead, imperatively, rather than relying
// on a prop that only works half the time.
export function useAnnounce(message) {
  const lastRef = useRef('');
  useEffect(() => {
    if (message && message !== lastRef.current) AccessibilityInfo.announceForAccessibility(message);
    lastRef.current = message || '';
  }, [message]);
}
