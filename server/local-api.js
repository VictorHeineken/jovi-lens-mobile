import http from 'node:http';
import analyzeImage from '../api/analyze-image.js';
import subjectAI from '../api/subject-ai.js';
import tts from '../api/tts.js';
import transcribe from '../api/transcribe.js';
import videoRecommendations from '../api/video-recommendations.js';
import authGoogle from '../api/auth/google.js';
import me from '../api/me.js';
import byokValidate from '../api/byok/validate.js';

const POST_ROUTES = {
  '/api/analyze-image': analyzeImage,
  '/api/subject-ai': subjectAI,
  '/api/tts': tts,
  '/api/transcribe': transcribe,
  '/api/video-recommendations': videoRecommendations,
  '/api/auth/google': authGoogle,
  '/api/byok/validate': byokValidate,
};

const GET_ROUTES = {
  '/api/me': me,
};

const HOST = process.env.JOVI_API_HOST || '127.0.0.1';
const PORT = Number(process.env.JOVI_API_PORT || 8787);
const WEB_URL = process.env.JOVI_WEB_URL || 'http://127.0.0.1:5173';
const MAX_BODY_BYTES = 4_000_000;

function sendJson(response, statusCode, payload) {
  if (response.writableEnded) return;
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

// Keeps the raw bytes: the guard hashes them for the Play Integrity request
// hash and parses the JSON itself (same code path as on Vercel).
function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(request.headers['content-length'] || 0);
    if (contentLength > MAX_BODY_BYTES) {
      reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
      request.resume();
      return;
    }

    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        request.destroy();
        reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
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
    setHeader(name, value) {
      if (!response.headersSent) response.setHeader(name, value);
      return adapter;
    },
  };
  return adapter;
}

const server = http.createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  if (request.method === 'GET' && (request.url === '/gallery' || request.url === '/camera')) {
    response.statusCode = 302;
    response.setHeader('Location', `${WEB_URL}${request.url}`);
    response.end();
    return;
  }

  const path = (request.url || '').split('?')[0];
  const handler = request.method === 'POST' ? POST_ROUTES[path] : request.method === 'GET' ? GET_ROUTES[path] : null;
  if (!handler) {
    sendJson(response, 404, { message: 'Rota local não encontrada.' });
    return;
  }

  // Reject non-JSON bodies: blocks the no-preflight cross-origin ("simple
  // request") vector that could fire paid actions without reading the response.
  const contentType = String(request.headers['content-type'] || '');
  if (request.method === 'POST' && contentType && !contentType.includes('application/json')) {
    sendJson(response, 415, { code: 'UNSUPPORTED_MEDIA_TYPE', message: 'Tipo de conteúdo não suportado.' });
    return;
  }

  try {
    const rawBody = request.method === 'POST' ? await readRawBody(request) : Buffer.alloc(0);
    let body;
    try {
      body = rawBody.length ? JSON.parse(rawBody.toString('utf8')) : {};
    } catch {
      body = undefined; // the guard answers 400 INVALID_JSON from rawBody
    }
    // ip comes from the socket, not a spoofable header — used as the rate-limit key.
    await handler({ method: request.method, headers: request.headers, url: request.url, ip: request.socket?.remoteAddress, body, rawBody }, createResponseAdapter(response));
  } catch (error) {
    const tooLarge = error?.statusCode === 413;
    sendJson(response, tooLarge ? 413 : 500, tooLarge
      ? { code: 'PAYLOAD_TOO_LARGE', message: 'Arquivo grande demais para enviar.' }
      : { message: 'Erro interno na API local.' });
    if (!tooLarge) console.error('JOVI Lens local API failed', { code: error?.code || 'LOCAL_API_ERROR' });
  }
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`JOVI Lens: a porta ${PORT} já está em uso. Feche outra instância local e tente novamente.`);
  } else {
    console.error('JOVI Lens local API failed to start', { code: error.code || 'LOCAL_API_START_ERROR' });
  }
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  console.log(`JOVI Lens local API: http://${HOST}:${PORT}/api/analyze-image`);
});

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
