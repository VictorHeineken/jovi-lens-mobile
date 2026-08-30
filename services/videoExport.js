// Renders a lesson's slides to an animated .webm slideshow via canvas capture.
// Audio is not mixed: browser speechSynthesis (used in Demo Mode) exposes no
// audio stream, so the export is a captioned visual slideshow that plays in-app
// with narration. The download is a real file (not an artifact sandbox).

const W = 720;
const H = 1280;

function pickMime() {
  const candidates = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || 'video/webm';
}

function background(ctx) {
  const gradient = ctx.createLinearGradient(0, 0, W, H);
  gradient.addColorStop(0, '#0d1411');
  gradient.addColorStop(0.55, '#26314b');
  gradient.addColorStop(1, '#4c42c8');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, W, H);
}

function wrapLines(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function progressBar(ctx, t) {
  ctx.fillStyle = 'rgba(255,255,255,.14)';
  ctx.fillRect(64, H - 90, W - 128, 8);
  ctx.fillStyle = '#c9f078';
  ctx.fillRect(64, H - 90, (W - 128) * Math.max(0, Math.min(1, t)), 8);
}

function drawTitle(ctx, title, subjectName, t) {
  background(ctx);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#c9f078';
  ctx.font = '800 34px "SF Pro Display", system-ui, sans-serif';
  ctx.fillText('AULA PERSONALIZADA', 64, 300);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 76px "SF Pro Display", system-ui, sans-serif';
  wrapLines(ctx, title, W - 128).slice(0, 4).forEach((line, i) => ctx.fillText(line, 64, 400 + i * 84));
  ctx.fillStyle = 'rgba(255,255,255,.7)';
  ctx.font = '500 34px "SF Pro Display", system-ui, sans-serif';
  ctx.fillText(subjectName, 64, H - 180);
  progressBar(ctx, t);
}

function drawSlide(ctx, slide, index, total, t) {
  background(ctx);
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(201,240,120,.9)';
  ctx.font = '800 26px "SF Pro Display", system-ui, sans-serif';
  ctx.fillText(`SLIDE ${index + 1} / ${total}`, 64, 150);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 60px "SF Pro Display", system-ui, sans-serif';
  let y = 240;
  wrapLines(ctx, slide.heading, W - 128).slice(0, 3).forEach((line) => { ctx.fillText(line, 64, y); y += 70; });

  y += 20;
  ctx.font = '600 36px "SF Pro Display", system-ui, sans-serif';
  (slide.bullets || []).slice(0, 4).forEach((bullet) => {
    ctx.fillStyle = '#c9f078';
    ctx.fillText('•', 64, y);
    ctx.fillStyle = 'rgba(255,255,255,.92)';
    wrapLines(ctx, bullet, W - 160).forEach((line, li) => { ctx.fillText(line, 100, y + li * 46); y += 46; });
    y += 14;
  });

  if (slide.narration) {
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    ctx.font = 'italic 500 30px "SF Pro Display", system-ui, sans-serif';
    const capY = Math.max(y + 30, H - 320);
    wrapLines(ctx, slide.narration, W - 128).slice(0, 5).forEach((line, li) => ctx.fillText(line, 64, capY + li * 40));
  }
  progressBar(ctx, t);
}

function animate(paint, ms) {
  return new Promise((resolve) => {
    const start = performance.now();
    function frame(now) {
      const t = Math.min(1, (now - start) / ms);
      paint(t);
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    }
    requestAnimationFrame(frame);
  });
}

function slideDuration(text) {
  return Math.max(3500, Math.min(12000, String(text || '').length * 55));
}

export async function exportLessonWebm({ title, subjectName, slides = [], onProgress }) {
  if (!window.MediaRecorder) throw new Error('Seu navegador não suporta exportar vídeo.');
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  const stream = canvas.captureStream(30);
  const recorder = new MediaRecorder(stream, { mimeType: pickMime() });
  const chunks = [];
  recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (event) => reject(event?.error || new Error('Falha na gravação do vídeo.'));
  });
  recorder.start();

  try {
    const total = slides.length;
    await animate((t) => drawTitle(ctx, title, subjectName, t), 2600);
    for (let i = 0; i < total; i += 1) {
      onProgress?.((i + 1) / (total + 1));
      // eslint-disable-next-line no-await-in-loop -- sequential slideshow frames.
      await animate((t) => drawSlide(ctx, slides[i], i, total, t), slideDuration(slides[i].narration));
    }
    onProgress?.(1);
    recorder.stop();
    await stopped;
  } finally {
    stream.getTracks().forEach((track) => track.stop());
  }

  const blob = new Blob(chunks, { type: chunks[0]?.type || 'video/webm' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `aula-${String(subjectName || 'jovi').toLowerCase().replace(/\s+/g, '-')}.webm`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}
