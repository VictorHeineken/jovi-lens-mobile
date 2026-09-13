// Subject aggregation, shared by both clients. Pure data shaping — no fetch, no
// env, no platform API — so the web app and the React Native app read the same
// code instead of two copies that can drift. The request half of the old
// services/subjectStudy.js stays per-client, because the URL and the demo-mode
// flag genuinely differ between them.

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
