// Abstract speaker roles used across the client/server boundary for TTS.
// The client (services/audio.js) only ever knows about these roles; each
// provider maps a role to its own real voice ID internally, which is what
// makes the TTS provider swappable via .env without touching client code.
export const VOICE_ROLES = ['A', 'B', 'narrator'];
export const DEFAULT_VOICE_ROLE = 'narrator';

export function normalizeVoiceRole(voice) {
  return VOICE_ROLES.includes(voice) ? voice : DEFAULT_VOICE_ROLE;
}
