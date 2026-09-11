import { getSubjectDemo } from './demoResponses.js';
import { isDemoMode } from './imageAnalysis.js';

// A "matéria" is note.category; its subthemes come from topicPath[0]/subcategory.
export function subthemeOf(note) {
  return (Array.isArray(note.topicPath) && note.topicPath[0]) || note.subcategory || 'Geral';
}

// Groups notes into subject objects ready for both the UI and the API payload.
export function aggregateSubjects(notes = []) {
  const map = new Map();
  notes.forEach((note) => {
    const name = note.category || 'Outros';
    if (!map.has(name)) map.set(name, []);
    map.get(name).push(note);
  });
  return [...map.entries()]
    .map(([name, items]) => ({
      name,
      count: items.length,
      subthemes: [...new Set(items.map(subthemeOf))],
      updatedAt: items.reduce((max, n) => Math.max(max, new Date(n.createdAt || 0).getTime()), 0),
      notes: items.map((n) => ({
        title: n.title,
        summary: n.summary,
        text: n.text,
        keyPoints: n.keyPoints,
        subtheme: subthemeOf(n),
        topicPath: n.topicPath,
      })),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

export function findSubject(notes, name) {
  return aggregateSubjects(notes).find((subject) => subject.name === name) || null;
}

// action ∈ questions | exam | plan | podcast-script | lesson-script
export async function generateSubjectContent(subject, { action, format } = {}) {
  const payloadSubject = { name: subject.name, notes: subject.notes, ...(format ? { format } : {}) };

  if (isDemoMode()) {
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    return { ...getSubjectDemo({ action, subject: payloadSubject }), provider: 'demo', model: 'jovi-lens-demo', mode: 'demo' };
  }

  let response;
  try {
    response = await fetch('/api/subject-ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, subject: payloadSubject }),
    });
  } catch {
    throw new Error('Sem conexão no momento. Confira a internet ou ative o modo demonstração.');
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || 'Não foi possível gerar este conteúdo agora.');
  return data;
}
