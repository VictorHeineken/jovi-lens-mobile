import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryStore, createUpstashStore, getStore, resetMemoryStore } from '../api/_lib/store.js';
import { withEnv } from './helpers/http.js';

const ORIGINAL_FETCH = globalThis.fetch;

test('memory store: hit counts per key and expires with the window', async () => {
  const store = createMemoryStore();
  assert.equal(await store.hit('rl:a', 60), 1);
  assert.equal(await store.hit('rl:a', 60), 2);
  assert.equal(await store.hit('rl:b', 60), 1);
  assert.equal(await store.hit('rl:short', 0.01), 1);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(await store.hit('rl:short', 0.01), 1);
});

test('memory store: setNX, get, set, del and TTL', async () => {
  const store = createMemoryStore();
  assert.equal(await store.setNX('k', 'pending', 600), true);
  assert.equal(await store.setNX('k', 'other', 600), false);
  assert.equal(await store.get('k'), 'pending');
  await store.set('k', '{"ok":true}', 600);
  assert.equal(await store.get('k'), '{"ok":true}');
  await store.del('k');
  assert.equal(await store.get('k'), null);
  await store.set('ttl', '1', 0.01);
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.equal(await store.get('ttl'), null);
});

test('memory store: credits reserve, refund, get and init', async () => {
  const store = createMemoryStore();
  assert.equal(await store.getCredits('u', 3), 3);
  assert.equal(await store.get('credits:u'), null, 'getCredits does not write');
  assert.equal(await store.initCredits('u', 3), true);
  assert.equal(await store.initCredits('u', 3), false);
  assert.equal(await store.reserveCredit('u', 3), 2);
  assert.equal(await store.reserveCredit('u', 3), 1);
  assert.equal(await store.reserveCredit('u', 3), 0);
  assert.equal(await store.reserveCredit('u', 3), -1);
  await store.refundCredit('u');
  assert.equal(await store.getCredits('u', 3), 1);
  assert.equal(await store.reserveCredit('fresh', 3), 2, 'reserve initializes a missing account');
});

test('getStore uses memory locally and refuses to on Vercel', async () => {
  await withEnv({ VERCEL: undefined, UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined, KV_REST_API_URL: undefined, KV_REST_API_TOKEN: undefined }, async () => {
    resetMemoryStore();
    assert.equal(getStore(), getStore());
  });
  await withEnv({ VERCEL: '1', UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined, KV_REST_API_URL: undefined, KV_REST_API_TOKEN: undefined }, async () => {
    assert.throws(() => getStore(), { code: 'STORE_UNAVAILABLE' });
  });
});

function mockUpstash(responder) {
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body);
    calls.push({ url: String(url), headers: options.headers, body });
    return new Response(JSON.stringify(responder(String(url), body)), { status: 200 });
  };
  return calls;
}

test('Upstash store builds the REST command and pipeline bodies', async () => {
  try {
    const calls = mockUpstash((url, body) => {
      if (url.endsWith('/pipeline')) return [{ result: 4 }, { result: 1 }];
      if (body[0] === 'EVAL') return { result: 2 };
      if (body[0] === 'SET') return { result: 'OK' };
      if (body[0] === 'GET') return { result: null };
      return { result: 1 };
    });
    const store = createUpstashStore({ url: 'https://redis.example.upstash.io', token: 'tkn' });

    assert.equal(await store.hit('rl:analyze:u:1', 60), 4);
    assert.equal(calls[0].url, 'https://redis.example.upstash.io/pipeline');
    assert.deepEqual(calls[0].body, [['INCR', 'rl:analyze:u:1'], ['EXPIRE', 'rl:analyze:u:1', '60']]);
    assert.equal(calls[0].headers.Authorization, 'Bearer tkn');

    assert.equal(await store.setNX('idem:u:x', 'pending', 600), true);
    assert.deepEqual(calls[1].body, ['SET', 'idem:u:x', 'pending', 'NX', 'EX', '600']);
    assert.equal(calls[1].url, 'https://redis.example.upstash.io');

    assert.equal(await store.reserveCredit('u', 3), 2);
    assert.equal(calls[2].body[0], 'EVAL');
    assert.match(calls[2].body[1], /redis\.call\('DECR', KEYS\[1\]\)/);
    assert.deepEqual(calls[2].body.slice(2), ['1', 'credits:u', '3']);

    assert.equal(await store.initCredits('u', 3), true);
    assert.deepEqual(calls[3].body, ['SET', 'credits:u', '3', 'NX']);

    assert.equal(await store.getCredits('u', 3), 3);
    assert.deepEqual(calls[4].body, ['GET', 'credits:u']);

    await store.refundCredit('u');
    assert.deepEqual(calls[5].body, ['INCR', 'credits:u']);

    await store.del('idem:u:x');
    assert.deepEqual(calls[6].body, ['DEL', 'idem:u:x']);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test('Upstash errors and network failures throw STORE_UNAVAILABLE', async () => {
  try {
    mockUpstash(() => ({ error: 'WRONGTYPE' }));
    const store = createUpstashStore({ url: 'https://redis.example.upstash.io', token: 'tkn' });
    await assert.rejects(store.get('k'), { code: 'STORE_UNAVAILABLE' });

    mockUpstash(() => [{ result: 1 }, { error: 'boom' }]);
    await assert.rejects(store.hit('k', 60), { code: 'STORE_UNAVAILABLE' });

    globalThis.fetch = async () => { throw new TypeError('network'); };
    await assert.rejects(store.get('k'), { code: 'STORE_UNAVAILABLE' });
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test('getStore prefers UPSTASH_* over KV_* variables', async () => {
  try {
    const calls = mockUpstash(() => ({ result: null }));
    await withEnv({ UPSTASH_REDIS_REST_URL: 'https://upstash.example', UPSTASH_REDIS_REST_TOKEN: 'u', KV_REST_API_URL: 'https://kv.example', KV_REST_API_TOKEN: 'k' }, async () => {
      await getStore().get('x');
    });
    assert.equal(calls[0].url, 'https://upstash.example');
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
  }
});
