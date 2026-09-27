// Dynamic layer over app.json (which stays the file version bumps edit).
// Cleartext HTTP is what lets a dev/preview build reach the local API over the
// LAN or `adb reverse` (http://127.0.0.1:8787). A production build must talk
// HTTPS only, so the flag is turned off for the EAS "production" profile or
// when APP_VARIANT=production is set for a local release build.
export default ({ config }) => {
  const production = process.env.EAS_BUILD_PROFILE === 'production' || process.env.APP_VARIANT === 'production';
  if (!production) return config;
  return {
    ...config,
    plugins: (config.plugins || []).map((plugin) => (
      Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
        ? [plugin[0], { ...plugin[1], android: { ...(plugin[1]?.android || {}), usesCleartextTraffic: false } }]
        : plugin
    )),
  };
};
