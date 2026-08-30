import http from 'node:http';
import analyzeImage from '../api/analyze-image.js';
import subjectAI from '../api/subject-ai.js';
import tts from '../api/tts.js';
import transcribe from '../api/transcribe.js';
import videoLesson from '../api/video-lesson.js';

const POST_ROUTES = {
  '/api/analyze-image': analyzeImage,
  '/api/subject-ai': subjectAI,
  '/api/tts': tts,
  '/api/transcribe': transcribe,
  '/api/video-lesson': videoLesson,
};

// GET routes (video-lesson doubles as a polling endpoint).
const GET_ROUTES = {
  '/api/video-lesson': videoLesson,
};

const HOST = process.env.JOVI_API_HOST || '127.0.0.1';
const PORT = Number(process.env.JOVI_API_PORT || 8787);
const WEB_URL = process.env.JOVI_WEB_URL || 'http://127.0.0.1:5173';
const MAX_BODY_BYTES = 11_000_000;

function sendJson(response, statusCode, payload) {
  if (response.writableEnded) return;
  response.statusCode = statusCode;
  response.setHeader('Content-Type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
}

function readJson(request) {
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
    request.on('end', () => {
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
    sendJson(response, 415, { message: 'Tipo de conteúdo não suportado.' });
    return;
  }

  try {
    const body = request.method === 'POST' ? await readJson(request) : {};
    // ip comes from the socket, not a spoofable header — used as the rate-limit key.
    await handler({ method: request.method, headers: request.headers, url: request.url, ip: request.socket?.remoteAddress, body }, createResponseAdapter(response));
  } catch (error) {
    const statusCode = error?.statusCode === 413 ? 413 : error?.statusCode === 400 ? 400 : 500;
    sendJson(response, statusCode, { message: statusCode === 413 ? 'Imagem grande demais.' : statusCode === 400 ? 'Requisição inválida.' : 'Erro interno na API local.' });
    if (statusCode >= 500) console.error('JOVI Lens local API failed', { code: error?.code || 'LOCAL_API_ERROR' });
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
