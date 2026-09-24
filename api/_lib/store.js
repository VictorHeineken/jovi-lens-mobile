// The single place that touches Redis. On Vercel it talks to Upstash over its
// REST API with plain fetch (the backend stays dependency-free); locally, with
// no Upstash vars set, an in-memory store with identical semantics is used.

const TIMEOUT_MS = 5000;

// Atomically initializes a new account to `initial` credits and spends one.
// Returns the remaining credits, or -1 when the account has none left.
const RESERVE_CREDIT_SCRIPT = `local v = redis.call('GET', KEYS[1])
if v == false then redis.call('SET', KEYS[1], ARGV[1]); v = ARGV[1] end
if tonumber(v) <= 0 then return -1 end
return redis.call('DECR', KEYS[1])`;

function storeUnavailable() {
  return Object.assign(new Error('Store unavailable.'), { code: 'STORE_UNAVAILABLE' });
}

function creditsKey(sub) {
  return `credits:${sub}`;
}

function restConfig() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: String(url).replace(/\/$/, ''), token } : null;
}

export function createUpstashStore({ url, token }) {
  async function post(path, body) {
    let response;
    try {
      response = await fetch(`${url}${path}`, {
        method: 'POST',
        redirect: 'error',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw storeUnavailable();
    }
    const payload = await response.json().catch(() => null);
    if (!response.ok || payload === null) throw storeUnavailable();
    return payload;
  }

  async function command(...args) {
    const payload = await post('', args);
    if (payload.error !== undefined) throw storeUnavailable();
    return payload.result;
  }

  async function pipeline(commands) {
    const payload = await post('/pipeline', commands);
    if (!Array.isArray(payload) || payload.some((item) => item?.error !== undefined)) throw storeUnavailable();
    return payload.map((item) => item.result);
  }

  return {
    async hit(key, windowSec) {
      const [count] = await pipeline([['INCR', key], ['EXPIRE', key, String(windowSec)]]);
      return Number(count);
    },
    async setNX(key, value, ttlSec) {
      const args = ['SET', key, String(value), 'NX'];
      if (ttlSec) args.push('EX', String(ttlSec));
      return (await command(...args)) === 'OK';
    },
    async get(key) {
      const result = await command('GET', key);
      return result === null || result === undefined ? null : String(result);
    },
    async set(key, value, ttlSec) {
      const args = ['SET', key, String(value)];
      if (ttlSec) args.push('EX', String(ttlSec));
      await command(...args);
    },
    async del(key) {
      await command('DEL', key);
    },
    async reserveCredit(sub, initial) {
      return Number(await command('EVAL', RESERVE_CREDIT_SCRIPT, '1', creditsKey(sub), String(initial)));
    },
    async refundCredit(sub) {
      await command('INCR', creditsKey(sub));
    },
    async getCredits(sub, initial) {
      const result = await command('GET', creditsKey(sub));
      return result === null || result === undefined ? Number(initial) : Number(result);
    },
    async initCredits(sub, initial) {
      return (await command('SET', creditsKey(sub), String(initial), 'NX')) === 'OK';
    },
  };
}

export function createMemoryStore() {
  const entries = new Map();

  function read(key) {
    const entry = entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt <= Date.now()) {
      entries.delete(key);
      return null;
    }
    return entry;
  }

  function write(key, value, ttlSec, keepExpiry = false) {
    const previous = keepExpiry ? read(key) : null;
    const expiresAt = ttlSec ? Date.now() + ttlSec * 1000 : previous?.expiresAt || null;
    entries.set(key, { value: String(value), expiresAt });
  }

  function incrBy(key, delta) {
    const next = Number(read(key)?.value || 0) + delta;
    write(key, next, undefined, true);
    return next;
  }

  return {
    async hit(key, windowSec) {
      const count = incrBy(key, 1);
      entries.get(key).expiresAt = Date.now() + windowSec * 1000;
      return count;
    },
    async setNX(key, value, ttlSec) {
      if (read(key)) return false;
      write(key, value, ttlSec);
      return true;
    },
    async get(key) {
      return read(key)?.value ?? null;
    },
    async set(key, value, ttlSec) {
      write(key, value, ttlSec);
    },
    async del(key) {
      entries.delete(key);
    },
    async reserveCredit(sub, initial) {
      const key = creditsKey(sub);
      if (!read(key)) write(key, initial);
      if (Number(read(key).value) <= 0) return -1;
      return incrBy(key, -1);
    },
    async refundCredit(sub) {
      incrBy(creditsKey(sub), 1);
    },
    async getCredits(sub, initial) {
      const entry = read(creditsKey(sub));
      return entry ? Number(entry.value) : Number(initial);
    },
    async initCredits(sub, initial) {
      if (read(creditsKey(sub))) return false;
      write(creditsKey(sub), initial);
      return true;
    },
  };
}

let memoryStore = null;

export function getStore() {
  const config = restConfig();
  if (config) return createUpstashStore(config);
  // On Vercel a missing store is a misconfiguration, never a silent fallback to
  // per-instance memory (which would reset credits on every cold start).
  if (process.env.VERCEL) throw storeUnavailable();
  memoryStore ??= createMemoryStore();
  return memoryStore;
}

// Tests only: start from an empty in-memory store.
export function resetMemoryStore() {
  memoryStore = null;
}
