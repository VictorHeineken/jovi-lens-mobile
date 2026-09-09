import { useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { searchLibrary } from '../services/search.js';

function resultLabel(kind) {
  return { nota: 'Nota', historico: 'Histórico', foto: 'Foto' }[kind] || 'Resultado';
}

export default function LibrarySearch({ notes, aiHistory, records, onOpen }) {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchLibrary(query, { notes, aiHistory, records }), [query, notes, aiHistory, records]);

  return (
    <section className="library-search" aria-label="Busca na biblioteca">
      <div className="library-search-input-wrap">
        <Icon name="search" size={17} />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar notas, textos e pesquisas..." aria-label="Buscar na biblioteca" />
        {query && <button className="library-search-clear" onClick={() => setQuery('')} aria-label="Limpar busca"><Icon name="close" size={14} /></button>}
      </div>

      {query && (
        <div className="library-search-results" role="listbox" aria-label="Resultados da busca">
          {results.length ? results.map((result) => (
            <button
              key={result.id}
              className="library-search-result"
              onClick={() => onOpen?.(result.record, result.kind === 'historico' ? 'study' : 'viewer')}
              role="option"
            >
              <span className="library-search-result-icon"><Icon name={result.kind === 'foto' ? 'image' : result.kind === 'historico' ? 'history' : 'note'} size={15} /></span>
              <span className="library-search-result-copy"><strong>{result.title}</strong><small>{resultLabel(result.kind)} · {result.category}</small>{result.summary && <span>{result.summary}</span>}</span>
              <Icon name="chevron" size={15} />
            </button>
          )) : <div className="library-search-empty"><Icon name="search" size={18} /><span>Nenhum resultado para “{query}”.</span></div>}
        </div>
      )}
    </section>
  );
}
