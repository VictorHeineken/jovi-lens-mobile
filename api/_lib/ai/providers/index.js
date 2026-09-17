import * as azureOpenAI from './azureOpenAI.js';
import * as minimax from './minimax.js';
import { notConfigured } from './shared.js';

// New providers register here as they're built (openai, anthropic, gemini).
const REGISTRY = {
  'azure-openai': azureOpenAI,
  minimax,
};

// Per-capability override vars let one provider serve chat while another
// serves tts/stt — useful when the AI_PROVIDER choice (e.g. Anthropic)
// doesn't cover every capability. Unset overrides just fall back to AI_PROVIDER.
const CAPABILITY_ENV = {
  chat: 'AI_CHAT_PROVIDER',
  vision: 'AI_VISION_PROVIDER',
  tts: 'AI_TTS_PROVIDER',
  stt: 'AI_STT_PROVIDER',
};

function resolveProviderName(capability) {
  const override = process.env[CAPABILITY_ENV[capability]];
  return String(override || process.env.AI_PROVIDER || '').trim().toLowerCase();
}

// Resolves which provider currently serves `capability`, per AI_PROVIDER /
// the capability's override var. Throws AI_NOT_CONFIGURED (same code the app
// already used for a missing Azure deployment) if unset, unrecognized, not
// supported by that provider's API, or missing its own required env vars.
export function getProvider(capability) {
  const name = resolveProviderName(capability);
  if (!name) {
    throw notConfigured(`Nenhum provedor de IA configurado para "${capability}". Defina AI_PROVIDER (ou ${CAPABILITY_ENV[capability]}) no .env.`);
  }
  const mod = REGISTRY[name];
  if (!mod) throw notConfigured(`Provedor de IA "${name}" não é reconhecido.`);
  if (!mod.capabilities?.[capability]) throw notConfigured(`O provedor "${name}" não oferece o recurso "${capability}".`);
  if (!mod.isConfigured(capability)) throw notConfigured(`O provedor "${name}" não está configurado para "${capability}". Confira as variáveis no .env.`);
  return { name, ...mod };
}

// Looks a provider up by exact name, bypassing env resolution.
export function getProviderByName(name) {
  const key = String(name || '').trim().toLowerCase();
  const mod = REGISTRY[key];
  if (!mod) throw notConfigured(`Provedor de IA "${name}" não é reconhecido.`);
  return { name: key, ...mod };
}
