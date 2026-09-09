// RN/Metro has no `import.meta.env` (that's Vite-only); Expo's convention for
// client-readable env vars is `process.env.EXPO_PUBLIC_*`, inlined at build time.
// Mirrors the web app's `VITE_JOVI_LENS_DEMO_MODE` flag (see services/imageAnalysis.js).
export function isDemoMode() {
  return String(process.env.EXPO_PUBLIC_JOVI_LENS_DEMO_MODE ?? 'true').toLowerCase() === 'true';
}
