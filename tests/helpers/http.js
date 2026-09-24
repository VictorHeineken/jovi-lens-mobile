import { Readable } from 'node:stream';

// A request stream carrying JSON.stringify(body), like Node's IncomingMessage
// with bodyParser disabled. `rawBody` overrides the bytes (e.g. invalid JSON).
export function makeReq({ method = 'POST', headers = {}, body, rawBody, url = '/api/test', ip = '10.0.0.1' } = {}) {
  const bytes = rawBody !== undefined ? Buffer.from(rawBody) : body === undefined ? Buffer.alloc(0) : Buffer.from(JSON.stringify(body));
  const req = Readable.from(bytes.length ? [bytes] : []);
  const normalized = Object.fromEntries(Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]));
  if (method === 'POST' && normalized['content-type'] === undefined) normalized['content-type'] = 'application/json';
  return Object.assign(req, { method, url, ip, headers: normalized });
}

export function makeRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(payload) {
      res.body = payload;
      return res;
    },
    setHeader(name, value) {
      res.headers[name.toLowerCase()] = value;
      return res;
    },
  };
  return res;
}

// Runs fn with the given env vars (undefined deletes one) and restores
// process.env afterwards, even when fn throws.
export async function withEnv(vars, fn) {
  const original = { ...process.env };
  try {
    for (const [key, value] of Object.entries(vars)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    return await fn();
  } finally {
    process.env = original;
  }
}

// Baseline for handler tests: no Vercel, no API key, no bypass, no integrity,
// in-memory store, and a session secret so tests can mint sessions.
export const BASE_ENV = {
  VERCEL: undefined,
  JOVI_API_KEY: undefined,
  JOVI_LOCAL_DEV_BYPASS: undefined,
  JOVI_REQUIRE_INTEGRITY: undefined,
  JOVI_LENS_DEMO_MODE: undefined,
  UPSTASH_REDIS_REST_URL: undefined,
  UPSTASH_REDIS_REST_TOKEN: undefined,
  KV_REST_API_URL: undefined,
  KV_REST_API_TOKEN: undefined,
  JOVI_FREE_CREDITS: undefined,
  JOVI_SESSION_SECRET: 'test-session-secret-0123456789abcdef',
};
