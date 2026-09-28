// Variant-specific overrides on top of app.json. APP_VARIANT comes from eas.json (or the shell).
export default ({ config }) => {
  const variant = process.env.APP_VARIANT || 'development';
  const presentation = variant === 'presentation';
  return {
    ...config,
    name: presentation ? 'JOVI Lens Demo' : config.name,
    // Exposed to the JS bundle (expo-constants) for the HTTPS check in services/apiClient.js.
    extra: { ...config.extra, appVariant: variant },
    android: { ...config.android, package: presentation ? 'com.jovilens.app.demo' : 'com.jovilens.app' },
    // Cleartext HTTP only lets a development build reach the local API over the
    // LAN or `adb reverse`; every other variant talks HTTPS only. Other
    // expo-build-properties options in app.json are kept.
    plugins: (config.plugins || []).map((plugin) => (Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
      ? [plugin[0], { ...plugin[1], android: { ...(plugin[1]?.android || {}), usesCleartextTraffic: variant === 'development' } }]
      : plugin)),
  };
};
