import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import analyzeImage from '../api/analyze-image.js';
import subjectAI from '../api/subject-ai.js';
import tts from '../api/tts.js';
import transcribe from '../api/transcribe.js';
import videoRecommendations from '../api/video-recommendations.js';
import authGoogle from '../api/auth/google.js';
import { hasValidApiKey, isJsonContentType } from '../api/_lib/http.js';

const POST_ROUTES = {
  '/api/analyze-image': analyzeImage,
  '/api/subject-ai': subjectAI,
  '/api/tts': tts,
  '/api/transcribe': transcribe,
  '/api/video-recommendations': videoRecommendations,
  // Answers 503 until GOOGLE_CLIENT_ID is configured, like every optional feature.
  '/api/auth/google': authGoogle,
};

const MAX_BODY_BYTES = 11_000_000;

const TOO_LARGE_MESSAGE = {
  '/api/analyze-image': 'Imagem grande demais.',
  '/api/transcribe': 'Áudio grande demais. Grave uma pergunta mais curta.',
};

function sendJson(response, statusCode, payload) {
  if (response.writableEnded) return;
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

// DNS rebinding makes an attacker's page same-origin with this server (its
// domain resolves to 127.0.0.1), which defeats the JSON content-type guard.
// The Host header still carries the attacker's name, so only IP literals,
// localhost and explicitly configured names (JOVI_ALLOWED_HOSTS, e.g. the
// deployed domain) are served.
function isAllowedHost(hostHeader, allowed) {
  const host = String(hostHeader || '').trim().toLowerCase();
  let name;
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    if (end === -1) return false;
    name = host.slice(1, end);
  } else {
    name = host.split(':')[0];
  }
  if (!name) return false;
  if (name === 'localhost' || isIP(name)) return true;
  return allowed.has(name);
}

// Rejected requests are answered without buffering their body; the socket is
// closed once the body passes the normal size cap. Unbounded draining kept
// anyone's upload running (536 MB in a test); cutting at a few KB made clients
// that upload before reading (Android's OkHttp) see "no connection" instead
// of the 403/415/401 that explains the problem.
function discardBody(request, response, limit = MAX_BODY_BYTES) {
  response.setHeader('Connection', 'close');
  let seen = 0;
  request.on('data', (chunk) => {
    seen += chunk.length;
    if (seen > limit) request.destroy();
  });
  request.resume();
}

function tooLarge() {
  return Object.assign(new Error('Request body too large.'), { statusCode: 413 });
}

// An oversized body is drained (not buffered) and answered with 413; destroying
// the socket used to turn it into a connection reset with no response and no
// log line. A body far past the limit is cut off to bound the work.
function readJson(request) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > MAX_BODY_BYTES) {
      // Answered right away; the client may keep sending, so cap what is read.
      let seen = 0;
      request.on('data', (chunk) => { seen += chunk.length; if (seen > MAX_BODY_BYTES) request.destroy(); });
      request.resume();
      reject(tooLarge());
      return;
    }

    const chunks = [];
    let size = 0;
    let overflow = false;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES * 4) { request.destroy(); return; }
      if (size > MAX_BODY_BYTES) { overflow = true; chunks.length = 0; return; }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (overflow) { reject(tooLarge()); return; }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'));
      } catch {
        reject(Object.assign(new Error('Invalid JSON.'), { statusCode: 400 }));
      }
    });
    request.on('error', reject);
  });
}

function createResponseAdapter(response) {
  const adapter = {
    statusCode: 200,
    status(code) {
      adapter.statusCode = code;
      return adapter;
    },
    json(payload) {
      sendJson(response, adapter.statusCode, payload);
      return adapter;
    },
  };
  return adapter;
}

// One JSON line per request: enough to correlate a client error (the app can
// show the X-Request-Id) with the server-side failure without logging bodies.
function defaultLog(entry) {
  const line = JSON.stringify({ time: new Date().toISOString(), ...entry });
  if (entry.status >= 500) console.error(line);
  else console.log(line);
}

export function createLocalApiServer({ webUrl = process.env.JOVI_WEB_URL || 'http://127.0.0.1:5173', log = defaultLog } = {}) {
  const allowedHosts = new Set(String(process.env.JOVI_ALLOWED_HOSTS || '').split(',').map((host) => host.trim().toLowerCase()).filter(Boolean));
  return http.createServer(async (request, response) => {
    const requestId = randomUUID();
    const startedAt = Date.now();
    const path = (request.url || '').split('?')[0];
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Request-Id', requestId);
    response.on('finish', () => {
      if (path.startsWith('/api/')) log({ level: response.statusCode >= 500 ? 'error' : 'info', requestId, method: request.method, path, status: response.statusCode, ms: Date.now() - startedAt });
    });

    if (!isAllowedHost(request.headers.host, allowedHosts)) {
      discardBody(request, response);
      sendJson(response, 403, { message: 'Host não permitido.' });
      return;
    }

    if (request.method === 'OPTIONS') {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (request.method === 'GET' && (path === '/gallery' || path === '/camera')) {
      response.statusCode = 302;
      response.setHeader('Location', `${webUrl}${path}`);
      response.end();
      return;
    }

    const handler = POST_ROUTES[path];
    if (!handler) {
      sendJson(response, 404, { message: 'Rota local não encontrada.' });
      return;
    }
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      sendJson(response, 405, { message: 'Método não permitido.' });
      return;
    }
    if (!isJsonContentType(request.headers['content-type'])) {
      discardBody(request, response);
      sendJson(response, 415, { message: 'Tipo de conteúdo não suportado.' });
      return;
    }

    // ip comes from the socket, not a spoofable header — used as the rate-limit key.
    const context = { method: request.method, headers: request.headers, url: request.url, ip: request.socket?.remoteAddress };
    // A caller without the shared key is answered from headers alone: the
    // handler's guard replies 401/429 (and counts the failure) without anyone
    // making this server buffer and parse up to 11 MB first.
    try {
      if (!hasValidApiKey(context)) {
        discardBody(request, response);
        await handler({ ...context, body: {} }, createResponseAdapter(response));
        return;
      }
      const body = await readJson(request);
      await handler({ ...context, body }, createResponseAdapter(response));
    } catch (error) {
      const statusCode = error?.statusCode === 413 ? 413 : error?.statusCode === 400 ? 400 : 500;
      const message = statusCode === 413 ? (TOO_LARGE_MESSAGE[path] || 'Conteúdo grande demais.') : statusCode === 400 ? 'Requisição inválida.' : 'Erro interno na API local.';
      sendJson(response, statusCode, { message, requestId });
      if (statusCode >= 500) console.error('JOVI Lens local API failed', { requestId, code: error?.code || 'LOCAL_API_ERROR' });
    }
  });
}
