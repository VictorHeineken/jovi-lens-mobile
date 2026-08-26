import { useEffect, useMemo, useState } from 'react';
import Icon from './Icon.jsx';
import { analyzeImage, copyText, googleSearch } from '../services/imageAnalysis.js';
import { useAppData } from '../context/AppDataContext.jsx';

export default function SmartImageSheet({ record, onClose }) {
  const { updateRecord, saveNote } = useAppData();
  const [analysis, setAnalysis] = useState(record?.analysis || null);
  const [loading, setLoading] = useState(!record?.analysis);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    setAnalysis(record?.analysis || null);
    setError('');

    if (!record || record.analysis) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    analyzeImage(record.src)
      .then(async (result) => {
        if (cancelled) return;
        setAnalysis(result);
        await updateRecord(record.id, { analysis: result });
      })
      .catch((err) => {
        if (!cancelled) setError(err.message || 'Falha ao analisar a imagem.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [record?.id]);

  const effectiveRecord = useMemo(() => record ? { ...record, analysis } : null, [record, analysis]);
  if (!record) return null;

  function flash(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 1600);
  }

  async function handleCopy() {
    if (!analysis?.text) return;
    try { await copyText(analysis.text); flash('Texto copiado'); } catch { flash('Não foi possível copiar'); }
  }

  function handleSearch() {
    if (googleSearch(analysis?.text)) flash('Abrindo Google');
  }

  function handleSave() {
    const saved = saveNote(effectiveRecord);
    flash(saved ? 'Nota salva' : 'Aguarde a análise');
  }

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label="Análise inteligente">
      <button className="sheet-close" onClick={onClose} aria-label="Fechar"><Icon name="close" size={20} /></button>
      <div className="smart-sheet">
        <div className="sheet-handle" />
        <div className="result-image-wrap">
          <img src={record.src} alt="Imagem selecionada" />
          {loading && <div className="scan-overlay"><span className="scan-line" /><div><Icon name="sparkle" size={18} /> Lendo com Gemini...</div></div>}
        </div>

        <div className="quick-actions">
          <button onClick={handleCopy} disabled={!analysis?.text}><span><Icon name="copy" /></span>Copiar</button>
          <button onClick={handleSearch} disabled={!analysis?.text}><span><Icon name="search" /></span>Google</button>
          <button className="ai-action" onClick={handleSave} disabled={!analysis}><span><Icon name="sparkle" /></span>Nota IA</button>
        </div>

        <div className="analysis-content">
          {loading && <div className="analysis-skeleton"><i /><i /><i /></div>}
          {error && (
            <div className="analysis-error">
              <strong>Análise indisponível</strong>
              <p>{error}</p>
              <small>Configure GEMINI_API_KEY na Vercel para ativar OCR e notas reais.</small>
            </div>
          )}
          {analysis && (
            <>
              <div className="eyebrow"><Icon name="sparkle" size={14} /> JOVI Intelligence</div>
              <h2>{analysis.title || 'Conteúdo identificado'}</h2>
              <p className="summary">{analysis.summary}</p>
              {!!analysis.keyPoints?.length && (
                <div className="key-points">
                  {analysis.keyPoints.map((point, index) => <div key={`${point}-${index}`}><Icon name="check" size={15} />{point}</div>)}
                </div>
              )}
              <div className="ocr-box">
                <div className="ocr-title"><span>Texto reconhecido</span><span>{analysis.language || 'auto'}</span></div>
                <p>{analysis.text || 'Nenhum texto legível foi encontrado nesta imagem.'}</p>
              </div>
            </>
          )}
        </div>
        {message && <div className="mini-toast"><Icon name="check" size={15} /> {message}</div>}
      </div>
    </div>
  );
}
