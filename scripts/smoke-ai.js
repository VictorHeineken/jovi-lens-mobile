// Live smoke test for the Gemini adapter with the server key (milestone M3).
// Not part of CI. Run from the repo root:
//   node --env-file=.env scripts/smoke-ai.js
// Needs GEMINI_API_KEY. Prints mime types, sizes and timings for each call.
import { readFile } from 'node:fs/promises';
import { complete, speak, transcribe } from '../api/_lib/ai/providers/gemini.js';

const SAMPLE_IMAGE = new URL('../assets/demo/demo-default-photo.jpg', import.meta.url);

const SENTENCES = [
  'A Revolução Industrial começou na Inglaterra no fim do século dezoito e mudou a forma como as pessoas trabalhavam e viviam.',
  'As máquinas a vapor aumentaram a produção das fábricas, mas também trouxeram jornadas longas e condições difíceis para os operários.',
  'Cidades cresceram rapidamente, muitas vezes sem saneamento, e isso provocou epidemias e revoltas por melhores condições de vida.',
  'Com o tempo, os trabalhadores se organizaram em sindicatos e conquistaram direitos como a redução da jornada e o fim do trabalho infantil.',
  'Para a prova, lembre das causas, das consequências sociais e das diferenças entre a primeira e a segunda fase da industrialização.',
];

// A pt-BR text of exactly 2000 characters (the /api/tts per-request cap).
function ttsSample() {
  let text = '';
  for (let i = 0; text.length < 2000; i += 1) text += `${text ? ' ' : ''}${SENTENCES[i % SENTENCES.length]}`;
  return text.slice(0, 2000);
}

async function step(name, fn) {
  const started = Date.now();
  try {
    const details = await fn();
    console.log(`✔ ${name} (${Date.now() - started} ms)`, details);
    return true;
  } catch (error) {
    console.log(`✖ ${name} (${Date.now() - started} ms)`, { code: error?.code, status: error?.status, message: error?.message });
    return false;
  }
}

async function main() {
  if (!process.env.GEMINI_API_KEY) {
    console.error('GEMINI_API_KEY não definido. Rode com: node --env-file=.env scripts/smoke-ai.js');
    process.exitCode = 1;
    return;
  }

  let spoken = null;
  const results = [];

  results.push(await step('complete (text)', async () => {
    const result = await complete({ messages: [{ role: 'user', content: 'Responda em JSON: {"capital":"<capital do Brasil>"}' }], maxTokens: 100 });
    return { model: result.model, chars: result.text.length, text: result.text.slice(0, 120) };
  }));

  results.push(await step('complete (image)', async () => {
    const image = (await readFile(SAMPLE_IMAGE)).toString('base64');
    const result = await complete({
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Descreva a imagem em JSON: {"descricao":"..."}' }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }] }],
      maxTokens: 300,
    });
    return { model: result.model, imageBase64Chars: image.length, chars: result.text.length, text: result.text.slice(0, 120) };
  }));

  results.push(await step('speak (2000-char pt-BR sample)', async () => {
    const text = ttsSample();
    spoken = await speak({ text, voice: 'narrator', timeoutMs: 60000 });
    const base64Length = spoken.buffer.toString('base64').length;
    return { inputChars: text.length, mimeType: spoken.mimeType, bytes: spoken.buffer.length, base64Length, underLimit: base64Length < 4_000_000 };
  }));

  results.push(await step('transcribe (the speak output)', async () => {
    if (!spoken) throw Object.assign(new Error('speak failed, nothing to transcribe'), { code: 'SKIPPED' });
    const mimeType = spoken.mimeType === 'audio/mpeg' ? 'audio/mp3' : spoken.mimeType;
    const result = await transcribe({ buffer: spoken.buffer, mimeType, timeoutMs: 60000 });
    return { model: result.model, chars: result.text.length, text: result.text.slice(0, 120) };
  }));

  const passed = results.filter(Boolean).length;
  console.log(`\n${passed}/${results.length} passaram.`);
  if (passed !== results.length) process.exitCode = 1;
}

main();
