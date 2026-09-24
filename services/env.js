// RN/Metro has no `import.meta.env` (that's Vite-only); Expo's convention for
// client-readable env vars is `process.env.EXPO_PUBLIC_*`, inlined at build time.
// The only demo/presentation switch in the app: true only in the presentation
// build (eas.json), which is fully offline with sample data.
export function isDemoMode() {
  return String(process.env.EXPO_PUBLIC_JOVI_LENS_DEMO_MODE ?? 'false').toLowerCase() === 'true';
}
