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
    plugins: config.plugins.map((plugin) => (Array.isArray(plugin) && plugin[0] === 'expo-build-properties'
      ? ['expo-build-properties', { android: { usesCleartextTraffic: variant === 'development' } }]
      : plugin)),
  };
};
