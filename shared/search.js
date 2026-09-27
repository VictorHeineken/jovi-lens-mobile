function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function scoreText(text, query) {
  const value = normalize(text);
  if (!value) return 0;
  if (value === query) return 100;
  if (value.startsWith(query)) return 80;
  if (value.includes(query)) return 45;
  return 0;
}

// Every word of the query must appear somewhere in the item, in any order —
// a student types "revolução fábricas", not the exact phrase of a note.
function termsOf(query) {
  return query.split(/\s+/).filter(Boolean);
}

function resultFor(item, kind, record, query) {
  const title = item.title || item.label || 'Conteúdo sem título';
  const category = item.category || item.subcategory || 'Estudos';
  const summary = item.summary || item.response || item.text || item.analysis?.summary || '';
  const searchable = [title, category, item.subcategory, item.prompt, item.text, item.contentText, summary, ...(item.tags || [])].join(' ');
  const normalized = normalize(searchable);
  const terms = termsOf(query);
  if (!terms.every((term) => normalized.includes(term))) return null;

  // Whole-phrase matches rank first; then each term scores on its own.
  const fieldScore = (text) => Math.max(scoreText(text, query) * 1.2, terms.reduce((sum, term) => sum + scoreText(text, term), 0) / terms.length);
  const score = Math.max(
    fieldScore(title),
    fieldScore(category) * 0.8,
    fieldScore(item.subcategory) * 0.7,
    fieldScore(summary) * 0.55,
  );
  return {
    id: `${kind}-${item.id}`,
    kind,
    title,
    category,
    summary,
    createdAt: item.createdAt,
    record: record || { id: item.recordId || item.id, src: item.image, label: title, aiAvailable: true, analysis: null },
    score,
  };
}

export function searchLibrary(query, { notes = [], aiHistory = [], records = [] } = {}) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];
  const recordMap = new Map(records.map((record) => [record.id, record]));
  const results = [
    ...notes.map((note) => resultFor(note, 'nota', recordMap.get(note.recordId), normalizedQuery)),
    ...aiHistory.map((entry) => resultFor(entry, 'historico', recordMap.get(entry.recordId), normalizedQuery)),
    ...records.map((record) => resultFor(record, 'foto', record, normalizedQuery)),
  ].filter(Boolean);

  const seen = new Set();
  return results
    .sort((a, b) => b.score - a.score || new Date(b.createdAt || 0) - new Date(a.createdAt || 0))
    .filter((result) => {
      const key = `${result.kind}:${result.record.id}:${result.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 30);
}
