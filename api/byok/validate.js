import { getProvider } from '../_lib/ai/providers/index.js';
import { defineRoute } from '../_lib/guard.js';

export const config = { api: { bodyParser: false } };

export default defineRoute({
  method: 'POST',
  scope: 'byok-validate',
  burstPerMinute: 5,
  auth: 'session',
  integrity: true,
  cost: 0,
  byok: 'required',
  validate: () => ({ input: {} }),
  run: async (_input, ctx) => {
    if (!ctx.byok) throw Object.assign(new Error('BYOK required.'), { code: 'BYOK_REQUIRED' });
    const provider = getProvider(undefined, { byok: ctx.byok });
    await provider.validateKey();
    const { chat, vision, tts, stt } = provider.capabilities;
    return { ok: true, provider: provider.name, capabilities: { chat, vision, tts, stt } };
  },
});
