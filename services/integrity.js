// Play Integrity standard requests (prod-implementation-spec.md §6.10). The
// token provider is prepared once per app run and re-prepared when Google
// invalidates it.
import JoviNative from '../modules/jovi-native/index.js';

let prepared = null;

export function integrityAvailable() {
  return Boolean(JoviNative?.prepareIntegrity && JoviNative?.requestIntegrityToken);
}

export function ensurePrepared() {
  prepared ??= JoviNative.prepareIntegrity(process.env.EXPO_PUBLIC_PLAY_INTEGRITY_PROJECT_NUMBER).catch((error) => {
    prepared = null;
    throw error;
  });
  return prepared;
}

export async function getIntegrityToken(hash) {
  try {
    await ensurePrepared();
    return await JoviNative.requestIntegrityToken(hash);
  } catch (error) {
    if (error?.code !== 'ERR_INTEGRITY_PROVIDER_INVALID' && error?.code !== 'ERR_INTEGRITY_NOT_PREPARED') throw error;
    prepared = null;
    await ensurePrepared();
    return JoviNative.requestIntegrityToken(hash);
  }
}
