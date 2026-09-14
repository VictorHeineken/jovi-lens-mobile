// Device-attestation slot — see auth-plan.md Phase 2, "App attestation".
// Not wired to a real check yet: real verification needs a Play Console app
// for com.jovilens.app linked to a Google Cloud project (to call the Play
// Integrity decodeIntegrityToken API), which doesn't exist yet. Until
// PLAY_INTEGRITY_PROJECT_NUMBER is set, this always reports "not enforced" so
// wiring it into a handler today is a no-op — safe to add the call site now
// and turn on enforcement later without touching handlers again.
//
// To finish this: register the app in Play Console, link a Cloud project,
// set PLAY_INTEGRITY_PROJECT_NUMBER, add a client-side token fetch (needs a
// native module + EAS development build — Expo Go can't load it) sending the
// token in a header (e.g. x-play-integrity-token), and implement the real
// check below using Google's decodeIntegrityToken API with a service account.
export async function verifyAttestation(_req) {
  if (!process.env.PLAY_INTEGRITY_PROJECT_NUMBER) return { verified: null, reason: 'not_configured' };
  return { verified: null, reason: 'not_implemented' };
}
