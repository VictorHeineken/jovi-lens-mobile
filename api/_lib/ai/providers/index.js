import * as azureOpenAI from './azureOpenAI.js';
import * as gemini from './gemini.js';
import * as minimax from './minimax.js';
import * as openai from './openai.js';
import { notConfigured } from './shared.js';

// AI_PROVIDER accepts any of these. azure-openai is server-only; the BYOK
// providers are the ones the user can bring a key for.
const REGISTRY = {
  'azure-openai': azureOpenAI,
  gemini,
  openai,
  minimax,
};

const BYOK_PROVIDERS = new Set(['gemini', 'openai', 'minimax']);

// Per-capability override vars let one provider serve chat while another
// serves tts/stt. Unset overrides just fall back to AI_PROVIDER.
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

function unsupported() {
  return Object.assign(new Error('Capability not supported by this provider.'), { code: 'BYOK_CAPABILITY_UNSUPPORTED' });
}

// The user's provider with every call pre-bound to the user's key. Model and
// voice settings still come from env or the adapter defaults.
function byokProvider(capability, byok) {
  const name = String(byok.provider || '').trim().toLowerCase();
  const mod = BYOK_PROVIDERS.has(name) ? REGISTRY[name] : null;
  if (!mod) throw notConfigured(`Provedor de IA "${name}" não é reconhecido.`);
  if (capability && !mod.capabilities?.[capability]) throw unsupported();
  const credentials = { apiKey: byok.apiKey };
  return {
    name,
    capabilities: mod.capabilities,
    ttsChunkLimit: mod.ttsChunkLimit,
    isConfigured: (cap) => mod.isConfigured(cap, credentials),
    complete: (args) => mod.complete({ ...args, credentials }),
    speak: (args) => mod.speak({ ...args, credentials }),
    transcribe: (args) => mod.transcribe({ ...args, credentials }),
    validateKey: () => mod.validateKey(credentials),
  };
}

// Resolves which provider serves `capability`. With `byok` it is the user's
// provider and key; otherwise AI_PROVIDER / the capability's override var.
// Throws AI_NOT_CONFIGURED if unset, unrecognized, unsupported, or missing its
// own required env vars.
export function getProvider(capability, { byok } = {}) {
  if (byok) return byokProvider(capability, byok);
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
