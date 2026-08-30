import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon.jsx';
import StudyModeContent from './StudyModeContent.jsx';
import { analyzeImage, copyText, extractText, googleSearch, requestStudyAction } from '../services/imageAnalysis.js';
import { startVoiceInput, voiceInputAvailable } from '../services/speechInput.js';
import { useAppData } from '../context/AppDataContext.jsx';

const MODES = [
  { id: 'understand', label: 'Explicar', icon: 'sparkle' },
  { id: 'solve', label: 'Resolver', icon: 'check' },
  { id: 'practice', label: 'Quiz', icon: 'question' },
  { id: 'flashcards', label: 'Cards', icon: 'cards' },
  { id: 'ask', label: 'Perguntar', icon: 'send' },
];

const MODE_LABELS = Object.fromEntries(MODES.map((item) => [item.id, item.label]));

function buildStudyHistoryEntry(record, analysis, action) {
  const learning = analysis?.learning || {};
  const section = action === 'practice' ? learning.practice : action === 'flashcards' ? learning.flashcards : learning[action];
  const text = action === 'flashcards'
    ? learning.flashcards?.map((card) => `${card.front}: ${card.back}`).join('\n')
    : section?.intro || section?.prompt || section?.question || section?.title || '';
  const label = MODE_LABELS[action] || 'Estudo';
  return {
    recordId: record.id,
    image: record.src,
    title: analysis?.title || record.label || 'Sessão de estudo',
    type: label,
    action,
    prompt: `Pedi para ${label.toLowerCase()} este conteúdo`,
    contentText: analysis?.text || '',
    text,
    response: text,
    category: analysis?.category || 'Estudos',
    subcategory: analysis?.subcategory || analysis?.subject || analysis?.contentType || 'Aprendizagem',
  };
}

export default function SmartImageSheet({ record, initialView = 'viewer', onClose }) {
  const { updateRecord, saveNote, addHistoryEntry } = useAppData();
  const [view, setView] = useState('viewer');
  const [analysis, setAnalysis] = useState(record?.analysis || null);
  const [loading, setLoading] = useState(false);
  const [analysisRequestedFor, setAnalysisRequestedFor] = useState(null);
  const [extractedText, setExtractedText] = useState(record?.analysis?.text || '');
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mode, setMode] = useState('understand');
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [quizSelection, setQuizSelection] = useState(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [flippedCard, setFlippedCard] = useState(null);

  useEffect(() => {
    setView(initialView);
    setAnalysis(record?.analysis || null);
    setLoading(false);
    setAnalysisRequestedFor(initialView === 'study' && !record?.analysis ? record?.id : null);
    setExtractedText(record?.analysis?.text || '');
    setTextLoading(false);
    setTextError('');
    setError('');
    setMode('understand');
    setQuestion('');
    setConversation([]);
    setQuizSelection(null);
    setQuizSubmitted(false);
    setFlippedCard(null);
    setActionLoading(false);
  }, [record?.id, initialView]);

  useEffect(() => {
    let cancelled = false;

    if (!record || record.analysis || analysisRequestedFor !== record.id) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    analyzeImage(record.src)
      .then(async (result) => {
        if (cancelled) return;
        setAnalysis(result);
        setExtractedText(result.text || '');
        await updateRecord(record.id, { analysis: result });
        addHistoryEntry({ recordId: record.id, image: record.src, title: result.title || record.label || 'Conteúdo identificado', type: 'Análise da imagem', action: 'analyze', prompt: 'Pedi para analisar esta imagem', contentText: result.text || '', text: result.summary || '', response: result.summary || '', keyPoints: result.keyPoints || [], category: result.category || 'Estudos', subcategory: result.subcategory || result.subject || result.contentType || 'Leitura inteligente' });
      })
      .catch((err) => { if (!cancelled) setError(err.message || 'Falha ao analisar a imagem.'); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [record?.id, analysisRequestedFor, updateRecord, addHistoryEntry]);

  const effectiveRecord = useMemo(() => record ? { ...record, analysis } : null, [record, analysis]);
  if (!record) return null;

  function flash(text) {
    setMessage(text);
    window.setTimeout(() => setMessage(''), 1800);
  }

  async function ensureText() {
    const knownText = String(analysis?.text || extractedText || '').trim();
    if (knownText) return knownText;

    setTextLoading(true);
    setTextError('');
    try {
      const result = await extractText(record.src);
      const text = String(result?.text || '').trim();
      setExtractedText(text);
      if (!text) setTextError('Nenhum texto legível foi encontrado.');
      return text;
    } catch (err) {
      setTextError(err.message || 'Não foi possível ler o texto agora.');
      return '';
    } finally {
      setTextLoading(false);
    }
  }

  async function handleCopyText() {
    const text = await ensureText();
    if (!text) return flash('Nenhum texto encontrado');
    const copied = await copyText(text).catch(() => false);
    flash(copied ? 'Texto copiado' : 'Não foi possível copiar');
  }

  async function handleSearchText() {
    const text = await ensureText();
    if (!text) return flash('Nenhum texto encontrado');
    googleSearch(text);
    flash('Pesquisa aberta no Google');
  }

  function startAI() {
    if (record.aiAvailable === false) return flash('Esta captura está salva apenas como referência.');
    setView('study');
    if (record.analysis || analysis) {
      setAnalysis(record.analysis || analysis);
      return;
    }
    setError('');
    setAnalysisRequestedFor(record.id);
  }

  async function handleMode(nextMode) {
    setMode(nextMode);
    setQuizSelection(null);
    setQuizSubmitted(false);
    setFlippedCard(null);
    if (nextMode === 'ask' || !analysis) return;

    const hasContent = nextMode === 'understand' ? analysis.learning?.understand : nextMode === 'solve' ? analysis.learning?.solve : nextMode === 'practice' ? analysis.learning?.practice : analysis.learning?.flashcards?.length;
    if (hasContent) {
      addHistoryEntry(buildStudyHistoryEntry(record, analysis, nextMode));
      return;
    }

    setActionLoading(true);
    try {
      const result = await requestStudyAction(record.src, { action: nextMode === 'practice' ? 'quiz' : nextMode, context: analysis });
      if (result.learning) setAnalysis((current) => ({ ...current, learning: { ...current.learning, ...result.learning } }));
      addHistoryEntry(buildStudyHistoryEntry(record, analysis, nextMode));
    } catch (err) {
      flash(err.message || 'Não foi possível preparar esse modo.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAskSubmit(event, suggestedQuestion = question) {
    event?.preventDefault();
    const text = String(suggestedQuestion || '').trim();
    if (!text || actionLoading || !analysis) return;
    setQuestion('');
    setActionLoading(true);
    try {
      const result = await requestStudyAction(record.src, { action: 'ask', question: text, context: analysis });
      setConversation((current) => [...current, { question: text, reply: result.reply || 'Não consegui formular uma resposta agora.' }]);
      addHistoryEntry({ recordId: record.id, image: record.src, title: analysis.title || record.label || 'Conversa sobre a imagem', type: 'Pergunta à IA', action: 'ask', prompt: text, contentText: analysis.text || '', text: result.reply || '', response: result.reply || '', category: analysis.category || 'Estudos', subcategory: analysis.subcategory || analysis.subject || analysis.contentType || 'Conversa contextual' });
    } catch (err) {
      flash(err.message || 'Não foi possível enviar a pergunta.');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleCopy() {
    if (!analysis?.text) return;
    try { await copyText(analysis.text); flash('Texto copiado'); } catch { flash('Não foi possível copiar'); }
  }

  function handleSearch() {
    if (googleSearch(analysis?.text)) flash('Abrindo pesquisa');
  }

  function handleSave() {
    const saved = saveNote(effectiveRecord);
    flash(saved ? 'Salvo nas notas' : 'Aguarde a análise');
  }

  const canAnalyze = record.aiAvailable !== false;

  return (
    <div className="sheet-backdrop" role="dialog" aria-modal="true" aria-label={view === 'viewer' ? 'Visualização da imagem' : 'Sessão de estudo'}>
      <button className="sheet-close" onClick={onClose} aria-label={view === 'viewer' ? 'Fechar imagem' : 'Fechar sessão de estudo'}><Icon name="close" size={20} /></button>
      {view === 'viewer' ? <ImageViewer record={record} isVideo={record.mediaType === 'video'} textLoading={textLoading} textError={textError} textReady={Boolean(analysis?.text || extractedText)} canAnalyze={canAnalyze} message={message} onCopy={handleCopyText} onSearch={handleSearchText} onStartAI={startAI} /> : (
        <SheetShell record={record} onClose={onClose} loading={loading} hasAnalysis={Boolean(analysis)} message={message}>
          {analysis && <div className="quick-actions" aria-label="Ações de estudo">
            {MODES.map((item) => <button key={item.id} className={mode === item.id ? 'ai-action' : ''} onClick={() => handleMode(item.id)} disabled={loading || actionLoading}><span><Icon name={item.icon} /></span>{item.label}</button>)}
          </div>}

          <div className="analysis-content">
            {loading && <div className="analysis-skeleton" aria-label="Analisando conteúdo"><i /><i /><i /></div>}
            {error && <div className="analysis-error" role="alert"><strong>Análise indisponível</strong><p>{error}</p><small>Verifique a conexão ou ative o modo demonstração para apresentar o fluxo sem depender da IA ao vivo.</small><button onClick={() => { setError(''); setAnalysisRequestedFor(null); window.setTimeout(() => setAnalysisRequestedFor(record.id), 0); }}>Tentar novamente</button></div>}
            {analysis && (
              <>
                <div className="analysis-heading"><div><div className="eyebrow"><Icon name="sparkle" size={14} /> Leitura inteligente</div><h2>{analysis.title || 'Conteúdo identificado'}</h2></div><span className="content-type">{analysis.contentType || 'Conteúdo visual'}</span></div>
                <p className="summary">{analysis.summary}</p>
                {!!analysis.keyPoints?.length && <div className="key-points">{analysis.keyPoints.map((point, index) => <div key={`${point}-${index}`}><Icon name="check" size={15} />{point}</div>)}</div>}

                <div className="learning-track" aria-label="Etapas de aprendizagem">
                  <span className="track-label">Trilha de aprendizagem</span>
                  <div>{[['understand', 'Entender'], ['solve', 'Resolver'], ['practice', 'Praticar']].map(([id, label], index) => <button key={id} className={mode === id || (id === 'practice' && mode === 'flashcards') ? 'active' : ''} onClick={() => handleMode(id)}><b>{String(index + 1).padStart(2, '0')}</b>{label}</button>)}</div>
                </div>

                {actionLoading && <div className="action-loading"><span className="loading-orbit" /> Preparando seu próximo passo...</div>}
                {!actionLoading && mode !== 'ask' && <StudyModeContent mode={mode} learning={analysis.learning} quizSelection={quizSelection} quizSubmitted={quizSubmitted} onQuizSelect={(index) => { setQuizSelection(index); setQuizSubmitted(true); }} flippedCard={flippedCard} onFlipCard={setFlippedCard} />}
                {mode === 'ask' && <AskPanel analysis={analysis} conversation={conversation} question={question} setQuestion={setQuestion} onSubmit={handleAskSubmit} disabled={actionLoading} />}

                <div className="source-actions"><button onClick={handleCopy} disabled={!analysis.text}><Icon name="copy" size={16} /> Copiar texto</button><button onClick={handleSearch} disabled={!analysis.text}><Icon name="search" size={16} /> Pesquisar</button><button className="save-action" onClick={handleSave}><Icon name="bookmark" size={16} /> Salvar</button></div>
              </>
            )}
          </div>
        </SheetShell>
      )}
    </div>
  );
}

function ImageViewer({ record, isVideo, textLoading, textError, textReady, canAnalyze, message, onCopy, onSearch, onStartAI }) {
  return (
    <div className="image-viewer">
      <div className="viewer-topbar"><span><span className="viewer-status-dot" /> Visualização</span><strong>{record.label || 'Imagem capturada'}</strong></div>
      <div className="viewer-image-stage">{isVideo ? <video src={record.src} controls playsInline aria-label={record.label || 'Vídeo capturado'} /> : <ImageWithFallback src={record.src} alt={record.label || 'Imagem capturada'} />}</div>
      <div className="viewer-footer">
        <div className="viewer-actions" aria-label="Ações da imagem">
          <button onClick={onCopy} disabled={isVideo || textLoading}><Icon name="copy" size={20} /><span>{textLoading ? 'Lendo texto...' : 'Copiar texto'}</span></button>
          <button onClick={onSearch} disabled={isVideo || textLoading}><Icon name="search" size={20} /><span>Pesquisar no Google</span></button>
          {canAnalyze ? <button className="viewer-ai-action" onClick={onStartAI}><Icon name="sparkle" size={20} /><span>Usar IA</span></button> : <button className="viewer-ai-action" disabled><Icon name="bookmark" size={20} /><span>Só galeria</span></button>}
        </div>
        <div className="viewer-feedback" role={textError ? 'alert' : undefined}>{isVideo ? 'Vídeo salvo na galeria.' : textError || (textReady ? 'Texto disponível para copiar ou pesquisar.' : 'Escolha uma ação para esta captura.')}</div>
      </div>
      {message && <div className="viewer-toast" role="status"><Icon name="check" size={15} /> {message}</div>}
    </div>
  );
}

function SheetShell({ record, onClose, loading, hasAnalysis, message, children }) {
  return (
    <div className="smart-sheet">
      <div className="sheet-handle" />
      <div className="result-image-wrap">
        {record.mediaType === 'video' ? <video src={record.src} controls playsInline aria-label="Vídeo capturado" /> : <ImageWithFallback src={record.src} alt="Conteúdo capturado" />}
        <div className="result-caption"><span className="status-dot" />{loading ? 'Identificando conteúdo' : hasAnalysis ? 'Conteúdo pronto para estudar' : 'Captura salva'}</div>
        {loading && <div className="scan-overlay"><span className="scan-line" /><div><Icon name="sparkle" size={18} /> Lendo a imagem...</div></div>}
      </div>
      {children}
      {message && <div className="mini-toast"><Icon name="check" size={15} /> {message}</div>}
    </div>
  );
}

function ImageWithFallback({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="image-error-state" role="img" aria-label={`${alt} indisponível`}><Icon name="image" size={30} /><span>Imagem indisponível</span></div>;
  }
  return <img src={src} alt={alt} onError={() => setFailed(true)} />;
}

function AskPanel({ analysis, conversation, question, setQuestion, onSubmit, disabled }) {
  return (
    <div className="ask-panel">
      <div className="mode-intro"><span className="mode-kicker">Conversa com contexto</span><h3>Pergunte sobre esta imagem</h3><p>A conversa continua ligada ao conteúdo que você capturou.</p></div>
      {!!analysis.suggestedQuestions?.length && <div className="suggested-questions">{analysis.suggestedQuestions.map((item) => <button key={item} onClick={(event) => onSubmit(event, item)} disabled={disabled}>{item}<Icon name="arrow-up-right" size={14} /></button>)}</div>}
      {!!conversation.length && <div className="conversation-list">{conversation.map((item, index) => <div className="conversation-turn" key={`${item.question}-${index}`}><div className="question-bubble">{item.question}</div><div className="answer-bubble"><span>JOVI AI</span>{item.reply}</div></div>)}</div>}
      <form className="question-form" onSubmit={onSubmit}><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Digite ou fale uma pergunta..." aria-label="Pergunta sobre a imagem" maxLength={500} /><VoiceButton onText={setQuestion} disabled={disabled} /><button type="submit" disabled={disabled || !question.trim()} aria-label="Enviar pergunta"><Icon name="send" size={17} /></button></form>
    </div>
  );
}

function VoiceButton({ onText, disabled }) {
  const [state, setState] = useState('idle'); // idle | recording | transcribing
  const controllerRef = useRef(null);

  useEffect(() => () => controllerRef.current?.stop?.(), []);

  if (!voiceInputAvailable()) return null;

  function toggle() {
    if (state !== 'idle') { controllerRef.current?.stop?.(); return; }
    setState('recording');
    controllerRef.current = startVoiceInput({
      onPartial: (text) => onText(text),
      onFinal: (text) => { if (text) onText(text); },
      onState: (next) => setState(next),
      onError: () => setState('idle'),
      onEnd: () => setState('idle'),
    });
  }

  const active = state !== 'idle';
  return (
    <button type="button" className={`voice-button ${state}`} onClick={toggle} disabled={disabled && !active} aria-pressed={active} aria-label={active ? 'Parar gravação' : 'Falar pergunta'}>
      <Icon name={state === 'transcribing' ? 'sparkle' : 'mic'} size={17} />
    </button>
  );
}
