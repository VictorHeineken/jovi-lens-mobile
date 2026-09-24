import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video';
import Icon from './Icon.jsx';
import { useBottomInset, useTopInset } from '../hooks/safeArea.js';
import { useToast } from '../shared/toast.js';
import StudyModeContent from './StudyModeContent.jsx';
import { analyzeImage, copyText, extractText, googleSearch, requestStudyAction } from '../services/imageAnalysis.js';
import { imageSource } from '../services/demoAssets.js';
import { startVoiceInput, voiceInputAvailable } from '../services/speechInput.js';
import { useAppData } from '../context/AppDataContext.jsx';
import AiErrorActions from './AiErrorActions.jsx';
import { ensureSignedIn, requireAI } from '../services/aiAccess.js';
import { ApiError, asAiError } from '../services/apiErrors.js';
import { isDemoMode } from '../services/env.js';
import { getUser } from '../services/storage.js';

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
  const topInset = useTopInset();
  const [view, setView] = useState('viewer');
  const [analysis, setAnalysis] = useState(record?.analysis || null);
  const [loading, setLoading] = useState(false);
  const [analysisRequestedFor, setAnalysisRequestedFor] = useState(null);
  const [extractedText, setExtractedText] = useState(record?.analysis?.text || '');
  const [textLoading, setTextLoading] = useState(false);
  const [textError, setTextError] = useState('');
  const [textAiError, setTextAiError] = useState(null); // { error, retry } for AiErrorActions
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [message, flash] = useToast(1800);
  const [mode, setMode] = useState('understand');
  const [question, setQuestion] = useState('');
  const [conversation, setConversation] = useState([]);
  const [quizSelection, setQuizSelection] = useState(null);
  const [quizSubmitted, setQuizSubmitted] = useState(false);
  const [flippedCard, setFlippedCard] = useState(null);
  const requestAbortRef = useRef(null);

  function cancelActiveRequest() {
    requestAbortRef.current?.abort();
    requestAbortRef.current = null;
  }

  function startRequest() {
    cancelActiveRequest();
    const controller = new AbortController();
    requestAbortRef.current = controller;
    return controller;
  }

  function isAbortError(err) {
    return err?.name === 'AbortError';
  }

  useEffect(() => {
    // Opening straight into study mode is an "Analisar" tap: it needs sign-in.
    const wantsAnalysis = initialView === 'study' && !record?.analysis;
    const needsSignIn = wantsAnalysis && !isDemoMode() && !getUser();
    if (needsSignIn) ensureSignedIn();
    setView(initialView);
    setAnalysis(record?.analysis || null);
    setLoading(false);
    setAnalysisRequestedFor(wantsAnalysis && !needsSignIn ? record?.id : null);
    setExtractedText(record?.analysis?.text || '');
    setTextLoading(false);
    setTextError('');
    setTextAiError(null);
    setError(needsSignIn ? new ApiError({ code: 'SIGN_IN_REQUIRED' }) : null);
    setActionError(null);
    setMode('understand');
    setQuestion('');
    setConversation([]);
    setQuizSelection(null);
    setQuizSubmitted(false);
    setFlippedCard(null);
    setActionLoading(false);
  }, [record?.id, initialView]);

  useEffect(() => () => cancelActiveRequest(), []);

  useEffect(() => {
    let cancelled = false;

    if (!record || record.analysis || analysisRequestedFor !== record.id) {
      setLoading(false);
      return () => { cancelled = true; };
    }

    setLoading(true);
    const controller = startRequest();
    analyzeImage(record.src, { signal: controller.signal })
      .then(async (result) => {
        if (cancelled) return;
        setAnalysis(result);
        setExtractedText(result.text || '');
        await updateRecord(record.id, { analysis: result });
        addHistoryEntry({ recordId: record.id, image: record.src, title: result.title || record.label || 'Conteúdo identificado', type: 'Análise da imagem', action: 'analyze', prompt: 'Pedi para analisar esta imagem', contentText: result.text || '', text: result.summary || '', response: result.summary || '', keyPoints: result.keyPoints || [], category: result.category || 'Estudos', subcategory: result.subcategory || result.subject || result.contentType || 'Leitura inteligente' });
      })
      .catch((err) => { if (!cancelled && !isAbortError(err)) setError(asAiError(err, 'Falha ao analisar a imagem.')); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => {
      cancelled = true;
      controller.abort();
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
    };
  }, [record?.id, analysisRequestedFor, updateRecord, addHistoryEntry]);

  const effectiveRecord = useMemo(() => (record ? { ...record, analysis } : null), [record, analysis]);
  if (!record) return null;

  async function ensureText(retry) {
    const knownText = String(analysis?.text || extractedText || '').trim();
    if (knownText) return knownText;
    if (!requireAI()) return '';

    setTextLoading(true);
    setTextError('');
    setTextAiError(null);
    const controller = startRequest();
    try {
      const result = await extractText(record.src, { signal: controller.signal });
      const text = String(result?.text || '').trim();
      setExtractedText(text);
      if (!text) setTextError('Nenhum texto legível foi encontrado.');
      return text;
    } catch (err) {
      if (!isAbortError(err)) {
        const error = asAiError(err, 'Não foi possível ler o texto agora.');
        setTextError(error.message);
        setTextAiError({ error, retry });
      }
      return '';
    } finally {
      setTextLoading(false);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
    }
  }

  async function handleCopyText() {
    const text = await ensureText(handleCopyText);
    if (!text) return flash('Nenhum texto encontrado');
    const copied = await copyText(text).catch(() => false);
    flash(copied ? 'Texto copiado' : 'Não foi possível copiar');
  }

  async function handleSearchText() {
    const text = await ensureText(handleSearchText);
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
    if (!requireAI()) {
      setError(new ApiError({ code: 'SIGN_IN_REQUIRED' }));
      return;
    }
    setError(null);
    setAnalysisRequestedFor(record.id);
  }

  function retryAnalysis() {
    if (!requireAI()) return;
    setError(null);
    setAnalysisRequestedFor(null);
    setTimeout(() => setAnalysisRequestedFor(record.id), 0);
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

    if (!requireAI()) return;
    setActionLoading(true);
    setActionError(null);
    const controller = startRequest();
    try {
      const result = await requestStudyAction(record.src, { action: nextMode === 'practice' ? 'quiz' : nextMode, context: analysis, signal: controller.signal });
      if (result.learning) setAnalysis((current) => ({ ...current, learning: { ...current.learning, ...result.learning } }));
      addHistoryEntry(buildStudyHistoryEntry(record, analysis, nextMode));
    } catch (err) {
      if (!isAbortError(err)) setActionError({ error: asAiError(err, 'Não foi possível preparar esse modo.'), retry: () => handleMode(nextMode) });
    } finally {
      setActionLoading(false);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
    }
  }

  async function handleAskSubmit(suggestedQuestion = question) {
    const text = String(suggestedQuestion || '').trim();
    if (!text || actionLoading || !analysis) return;
    if (!requireAI()) return;
    setQuestion('');
    setActionLoading(true);
    setActionError(null);
    const controller = startRequest();
    try {
      const result = await requestStudyAction(record.src, { action: 'ask', question: text, context: analysis, signal: controller.signal });
      setConversation((current) => [...current, { question: text, reply: result.reply || 'Não consegui formular uma resposta agora.' }]);
      addHistoryEntry({ recordId: record.id, image: record.src, title: analysis.title || record.label || 'Conversa sobre a imagem', type: 'Pergunta à IA', action: 'ask', prompt: text, contentText: analysis.text || '', text: result.reply || '', response: result.reply || '', category: analysis.category || 'Estudos', subcategory: analysis.subcategory || analysis.subject || analysis.contentType || 'Conversa contextual' });
    } catch (err) {
      if (!isAbortError(err)) setActionError({ error: asAiError(err, 'Não foi possível enviar a pergunta.'), retry: () => handleAskSubmit(text) });
    } finally {
      setActionLoading(false);
      if (requestAbortRef.current === controller) requestAbortRef.current = null;
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
    <Modal visible animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View className="flex-1 bg-white">
        <Pressable
          onPress={onClose}
          accessibilityLabel={view === 'viewer' ? 'Fechar imagem' : 'Fechar sessão de estudo'}
          className="absolute right-4 z-10 h-9 w-9 items-center justify-center rounded-full bg-black/45"
          style={{ top: topInset }}
        >
          <Icon name="close" size={20} color="#ffffff" />
        </Pressable>
        {view === 'viewer' ? (
          <ImageViewer
            record={record}
            isVideo={record.mediaType === 'video'}
            textLoading={textLoading}
            textError={textError}
            textAiError={textAiError}
            onNavigateAway={onClose}
            textReady={Boolean(analysis?.text || extractedText)}
            canAnalyze={canAnalyze}
            message={message}
            onCopy={handleCopyText}
            onSearch={handleSearchText}
            onStartAI={startAI}
          />
        ) : (
          <SheetShell record={record} loading={loading} hasAnalysis={Boolean(analysis)} message={message}>
            {analysis ? (
              <View className="flex-row flex-wrap gap-2 px-4 pt-3" accessibilityLabel="Ações de estudo">
                {MODES.map((item) => {
                  const active = mode === item.id;
                  return (
                    <Pressable
                      accessibilityRole="button"
                      key={item.id}
                      onPress={() => handleMode(item.id)}
                      disabled={loading || actionLoading}
                      className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'}`}
                    >
                      <Icon name={item.icon} size={14} color={active ? '#ffffff' : '#475569'} />
                      <Text className={`text-[13px] font-medium ${active ? 'text-white' : 'text-slate-600'}`}>{item.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}

            <View className="gap-4 px-4 py-4">
              {loading ? (
                <View className="gap-2" accessibilityLabel="Analisando conteúdo">
                  <View className="h-4 rounded-full bg-slate-100" />
                  <View className="h-4 w-4/5 rounded-full bg-slate-100" />
                  <View className="h-4 w-3/5 rounded-full bg-slate-100" />
                </View>
              ) : null}
              {error ? (
                <View className="gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-4" accessibilityRole="alert">
                  <Text className="text-[14px] font-bold text-red-700">Análise indisponível</Text>
                  <Text className="text-[13px] text-red-600">{error.message}</Text>
                  <AiErrorActions error={error} onRetry={retryAnalysis} onNavigateAway={onClose} />
                </View>
              ) : null}
              {analysis ? (
                <>
                  <View className="flex-row items-start justify-between gap-3">
                    <View className="flex-1 gap-1">
                      <View className="flex-row items-center gap-1.5">
                        <Icon name="sparkle" size={14} color="#4f46e5" />
                        <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Leitura inteligente</Text>
                      </View>
                      <Text className="text-[19px] font-bold text-slate-900">{analysis.title || 'Conteúdo identificado'}</Text>
                    </View>
                    <View className="rounded-full bg-slate-100 px-3 py-1">
                      <Text className="text-[11px] font-medium text-slate-500">{analysis.contentType || 'Conteúdo visual'}</Text>
                    </View>
                  </View>
                  <Text className="text-[14px] leading-5 text-slate-700">{analysis.summary}</Text>
                  {analysis.keyPoints?.length ? (
                    <View className="gap-1.5">
                      {analysis.keyPoints.map((point, index) => (
                        <View key={`${point}-${index}`} className="flex-row items-start gap-2">
                          <Icon name="check" size={15} color="#16a34a" />
                          <Text className="flex-1 text-[13px] text-slate-700">{point}</Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  <View className="gap-2" accessibilityLabel="Etapas de aprendizagem">
                    <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Trilha de aprendizagem</Text>
                    <View className="flex-row gap-2">
                      {[['understand', 'Entender'], ['solve', 'Resolver'], ['practice', 'Praticar']].map(([id, label], index) => {
                        const active = mode === id || (id === 'practice' && mode === 'flashcards');
                        return (
                          <Pressable
                            accessibilityRole="button"
                            key={id}
                            onPress={() => handleMode(id)}
                            className={`flex-1 items-center gap-1 rounded-xl border px-2 py-2.5 ${active ? 'border-indigo-500 bg-indigo-50' : 'border-slate-200 bg-white'}`}
                          >
                            <Text className={`text-[12px] font-bold ${active ? 'text-indigo-600' : 'text-slate-400'}`}>{String(index + 1).padStart(2, '0')}</Text>
                            <Text className={`text-[13px] font-medium ${active ? 'text-indigo-700' : 'text-slate-600'}`}>{label}</Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {actionLoading ? (
                    <Text className="text-[13px] text-slate-500">Preparando seu próximo passo...</Text>
                  ) : null}
                  {actionError ? (
                    <View className="rounded-xl bg-red-50 px-3 py-2.5" accessibilityRole="alert">
                      <Text className="text-[13px] text-red-600">{actionError.error.message}</Text>
                      <AiErrorActions error={actionError.error} onRetry={actionError.retry} onNavigateAway={onClose} />
                    </View>
                  ) : null}
                  {!actionLoading && mode !== 'ask' ? (
                    <StudyModeContent
                      mode={mode}
                      learning={analysis.learning}
                      quizSelection={quizSelection}
                      quizSubmitted={quizSubmitted}
                      onQuizSelect={(index) => { setQuizSelection(index); setQuizSubmitted(true); }}
                      flippedCard={flippedCard}
                      onFlipCard={setFlippedCard}
                    />
                  ) : null}
                  {mode === 'ask' ? (
                    <AskPanel
                      analysis={analysis}
                      conversation={conversation}
                      question={question}
                      setQuestion={setQuestion}
                      onSubmit={handleAskSubmit}
                      disabled={actionLoading}
                    />
                  ) : null}

                  <View className="flex-row gap-2 pt-2">
                    <SourceActionButton icon="copy" label="Copiar texto" onPress={handleCopy} disabled={!analysis.text} />
                    <SourceActionButton icon="search" label="Pesquisar" onPress={handleSearch} disabled={!analysis.text} />
                    <SourceActionButton icon="bookmark" label="Salvar" onPress={handleSave} primary />
                  </View>
                </>
              ) : null}
            </View>
          </SheetShell>
        )}
      </View>
    </Modal>
  );
}

function ImageViewer({ record, isVideo, textLoading, textError, textAiError, onNavigateAway, textReady, canAnalyze, message, onCopy, onSearch, onStartAI }) {
  const topInset = useTopInset();
  // The action row holds the primary "Usar IA" CTA, and this is a Modal — it
  // draws under the Android gesture bar, so the old flat py-4 put the button
  // partly under it.
  const bottomInset = useBottomInset(16);
  return (
    <View className="flex-1">
      <View className="flex-row items-center justify-between px-4 pb-3" style={{ paddingTop: topInset }}>
        <View className="flex-row items-center gap-2">
          <View className="h-2 w-2 rounded-full bg-emerald-500" />
          <Text className="text-[12px] font-medium text-slate-500">Visualização</Text>
        </View>
        <Text className="text-[14px] font-semibold text-slate-900" numberOfLines={1}>{record.label || 'Imagem capturada'}</Text>
      </View>
      <View className="flex-1 items-center justify-center bg-black">
        {isVideo ? <VideoField uri={record.src} /> : <ImageWithFallback src={record.src} alt={record.label || 'Imagem capturada'} />}
      </View>
      <View className="gap-3 px-4 pt-4" style={{ paddingBottom: bottomInset }}>
        <View className="flex-row gap-2" accessibilityLabel="Ações da imagem">
          <ViewerActionButton icon="copy" label={textLoading ? 'Lendo texto...' : 'Copiar texto'} onPress={onCopy} disabled={isVideo || textLoading} />
          <ViewerActionButton icon="search" label="Pesquisar no Google" onPress={onSearch} disabled={isVideo || textLoading} />
          {canAnalyze ? (
            <ViewerActionButton icon="sparkle" label="Usar IA" onPress={onStartAI} primary />
          ) : (
            <ViewerActionButton icon="bookmark" label="Só galeria" disabled />
          )}
        </View>
        <Text className="text-[12px] text-slate-500" accessibilityRole={textError ? 'alert' : undefined}>
          {isVideo ? 'Vídeo salvo na galeria.' : textError || (textReady ? 'Texto disponível para copiar ou pesquisar.' : 'Escolha uma ação para esta captura.')}
        </Text>
        {!isVideo && textAiError ? <AiErrorActions error={textAiError.error} onRetry={textAiError.retry} onNavigateAway={onNavigateAway} /> : null}
      </View>
      {message ? (
        <View className="absolute bottom-24 left-4 right-4 flex-row items-center justify-center gap-2 rounded-full bg-slate-900/90 px-4 py-2.5">
          <Icon name="check" size={15} color="#ffffff" />
          <Text className="text-[13px] font-medium text-white">{message}</Text>
        </View>
      ) : null}
    </View>
  );
}

function ViewerActionButton({ icon, label, onPress, disabled, primary }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 items-center gap-1 rounded-2xl px-2 py-3 ${primary ? 'bg-indigo-600' : 'bg-white/10'} ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon name={icon} size={20} color="#ffffff" />
      <Text className="text-center text-[11px] font-medium text-white" numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function SheetShell({ record, loading, hasAnalysis, message, children }) {
  const topInset = useTopInset();
  const bottomInset = useBottomInset(40);
  return (
    <ScrollView className="flex-1" contentContainerStyle={{ paddingTop: topInset, paddingBottom: bottomInset }}>
      <View className="items-center pt-2">
        <View className="h-1 w-10 rounded-full bg-slate-200" />
      </View>
      <View className="mt-2 px-4">
        <View className="relative overflow-hidden rounded-2xl bg-slate-100">
          {record.mediaType === 'video' ? (
            <VideoField uri={record.src} />
          ) : (
            <ImageWithFallback src={record.src} alt="Conteúdo capturado" />
          )}
          <View className="absolute bottom-2 left-2 flex-row items-center gap-1.5 rounded-full bg-black/55 px-3 py-1">
            <View className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            <Text className="text-[11px] font-medium text-white">{loading ? 'Identificando conteúdo' : hasAnalysis ? 'Conteúdo pronto para estudar' : 'Captura salva'}</Text>
          </View>
          {loading ? (
            <View className="absolute inset-0 items-center justify-center gap-2 bg-black/35">
              <Icon name="sparkle" size={18} color="#ffffff" />
              <Text className="text-[12px] font-medium text-white">Lendo a imagem...</Text>
            </View>
          ) : null}
        </View>
      </View>
      {children}
      {message ? (
        <View className="mx-4 mt-2 flex-row items-center gap-2 self-start rounded-full bg-slate-900 px-3 py-1.5">
          <Icon name="check" size={15} color="#ffffff" />
          <Text className="text-[12px] font-medium text-white">{message}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

function VideoField({ uri }) {
  const player = useVideoPlayer(uri || null);
  if (!uri) return null;
  return <VideoView player={player} style={{ width: '100%', height: 260 }} nativeControls allowsFullscreen contentFit="contain" />;
}

function ImageWithFallback({ src, alt }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <View className="h-64 items-center justify-center gap-2" accessibilityLabel={`${alt} indisponível`}>
        <Icon name="image" size={30} color="#94a3b8" />
        <Text className="text-[12px] text-slate-400">Imagem indisponível</Text>
      </View>
    );
  }
  return <Image source={imageSource(src)} accessibilityIgnoresInvertColors accessibilityLabel={alt} onError={() => setFailed(true)} className="h-64 w-full" resizeMode="contain" />;
}

function SourceActionButton({ icon, label, onPress, disabled, primary }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 ${primary ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'} ${disabled ? 'opacity-40' : ''}`}
    >
      <Icon name={icon} size={16} color={primary ? '#ffffff' : '#475569'} />
      <Text className={`text-[12px] font-medium ${primary ? 'text-white' : 'text-slate-600'}`}>{label}</Text>
    </Pressable>
  );
}

function AskPanel({ analysis, conversation, question, setQuestion, onSubmit, disabled }) {
  return (
    <View className="gap-4">
      <View className="gap-1">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Conversa com contexto</Text>
        <Text className="text-[17px] font-bold text-slate-900">Pergunte sobre esta imagem</Text>
        <Text className="text-[13px] text-slate-600">A conversa continua ligada ao conteúdo que você capturou.</Text>
      </View>
      {analysis.suggestedQuestions?.length ? (
        <View className="gap-2">
          {analysis.suggestedQuestions.map((item) => (
            <Pressable accessibilityRole="button" key={item} onPress={() => onSubmit(item)} disabled={disabled} className="flex-row items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5">
              <Text className="flex-1 text-[13px] text-slate-700">{item}</Text>
              <Icon name="arrow-up-right" size={14} color="#94a3b8" />
            </Pressable>
          ))}
        </View>
      ) : null}
      {conversation.length ? (
        <View className="gap-3">
          {conversation.map((item, index) => (
            <View key={`${item.question}-${index}`} className="gap-2">
              <View className="self-end rounded-2xl rounded-tr-sm bg-indigo-600 px-3 py-2">
                <Text className="text-[13px] text-white">{item.question}</Text>
              </View>
              <View className="gap-1 self-start rounded-2xl rounded-tl-sm bg-slate-100 px-3 py-2">
                <Text className="text-[11px] font-semibold text-indigo-500">JOVI AI</Text>
                <Text className="text-[13px] text-slate-800">{item.reply}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">
        <TextInput
          value={question}
          onChangeText={setQuestion}
          placeholder="Digite ou fale uma pergunta..."
          accessibilityLabel="Pergunta sobre a imagem"
          maxLength={500}
          onSubmitEditing={() => onSubmit()}
          className="flex-1 text-[14px] text-slate-900"
          placeholderTextColor="#94a3b8"
        />
        <VoiceButton onText={setQuestion} disabled={disabled} />
        <Pressable onPress={() => onSubmit()} disabled={disabled || !question.trim()} accessibilityLabel="Enviar pergunta" className="h-8 w-8 items-center justify-center rounded-full bg-indigo-600">
          <Icon name="send" size={16} color="#ffffff" />
        </Pressable>
      </View>
    </View>
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
    <Pressable
      onPress={toggle}
      disabled={disabled && !active}
      accessibilityState={{ selected: active }}
      accessibilityLabel={active ? 'Parar gravação' : 'Falar pergunta'}
      className={`h-8 w-8 items-center justify-center rounded-full ${active ? 'bg-red-500' : 'bg-slate-200'}`}
    >
      <Icon name={state === 'transcribing' ? 'sparkle' : 'mic'} size={17} color={active ? '#ffffff' : '#475569'} />
    </Pressable>
  );
}
