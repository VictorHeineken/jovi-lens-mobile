import { createLocalApiServer } from './app.js';

const HOST = process.env.JOVI_API_HOST || '127.0.0.1';
const PORT = Number(process.env.JOVI_API_PORT || 8787);

const server = createLocalApiServer();

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
