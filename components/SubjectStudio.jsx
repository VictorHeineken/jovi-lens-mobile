import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Icon from './Icon.jsx';
import { useBottomInset, useTopInset } from '../hooks/safeArea.js';
import SubjectExam from './SubjectExam.jsx';
import StudyPlan from './StudyPlan.jsx';
import PodcastPlayer from './PodcastPlayer.jsx';
import LessonPlayer from './LessonPlayer.jsx';
import VideoRecommendations from './VideoRecommendations.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { useAppData } from '../context/AppDataContext.jsx';
import { buildSubjectInsights } from '../shared/subjectInsights.js';
import { getPresentationExamResult } from '../shared/demoSubjectArtifacts.js';

const TABS = [
  { id: 'overview', label: 'Visão', icon: 'layers' },
  { id: 'questions', label: 'Perguntas', icon: 'question' },
  { id: 'exam', label: 'Simulado', icon: 'target' },
  { id: 'podcast', label: 'Podcast', icon: 'waveform' },
  { id: 'lesson', label: 'Vídeo aula', icon: 'film' },
  { id: 'plan', label: 'Plano', icon: 'route' },
];

export default function SubjectStudio({ subject, onClose }) {
  const { saveSubjectArtifact, getSubjectArtifact } = useAppData();
  const [tab, setTab] = useState('overview');
  const topInset = useTopInset();
  const bottomInset = useBottomInset(16);

  if (!subject) return null;

  const rawExamResult = getSubjectArtifact(subject.name, 'examResult')?.data || null;
  const examResult = getPresentationExamResult(subject, rawExamResult);
  const savedExam = getSubjectArtifact(subject.name, 'exam')?.data || null;
  const savedPlan = getSubjectArtifact(subject.name, 'plan')?.data || null;
  const savedPlanProgress = getSubjectArtifact(subject.name, 'planProgress')?.data || {};
  const savedQuestions = getSubjectArtifact(subject.name, 'questions')?.data || null;
  const savedPodcast = getSubjectArtifact(subject.name, 'podcast')?.data || null;
  const savedPodcasts = getSubjectArtifact(subject.name, 'podcasts')?.data || null;
  const savedLesson = getSubjectArtifact(subject.name, 'lesson')?.data || null;
  const savedVideoRecommendations = getSubjectArtifact(subject.name, 'videoRecommendations')?.data || null;
  const insightArtifacts = {
    questions: savedQuestions ? { data: savedQuestions } : null,
    exam: savedExam ? { data: savedExam } : null,
    examResult: examResult ? { data: examResult } : null,
    plan: savedPlan ? { data: savedPlan } : null,
    podcast: savedPodcast ? { data: savedPodcast } : null,
    videoRecommendations: savedVideoRecommendations ? { data: savedVideoRecommendations } : null,
    lesson: savedLesson ? { data: savedLesson } : null,
  };
  const insights = buildSubjectInsights(subject, insightArtifacts);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View className="flex-1 bg-white">
        <Pressable
          onPress={onClose}
          accessibilityLabel="Fechar estúdio da matéria"
          className="absolute right-4 z-10 h-9 w-9 items-center justify-center rounded-full bg-slate-100"
          style={{ top: topInset }}
        >
          <Icon name="close" size={20} color="#475569" />
        </Pressable>

        <View className="gap-2 px-4 pb-3" style={{ paddingTop: topInset }}>
          <View className="flex-row items-center gap-1.5">
            <Icon name="layers" size={13} color="#4f46e5" />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Estúdio da matéria</Text>
          </View>
          <Text className="text-[22px] font-bold text-slate-900">{subject.name}</Text>
          <View className="flex-row gap-3">
            <View className="flex-row items-center gap-1">
              <Icon name="note" size={12} color="#94a3b8" />
              <Text className="text-[12px] text-slate-500">{subject.count} {subject.count === 1 ? 'nota' : 'notas'}</Text>
            </View>
            <View className="flex-row items-center gap-1">
              <Icon name="layers" size={12} color="#94a3b8" />
              <Text className="text-[12px] text-slate-500">{subject.subthemes.length} {subject.subthemes.length === 1 ? 'subtema' : 'subtemas'}</Text>
            </View>
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {subject.subthemes.slice(0, 6).map((theme) => (
              <View key={theme} className="rounded-full bg-slate-100 px-2.5 py-1">
                <Text className="text-[11px] text-slate-500">{theme}</Text>
              </View>
            ))}
          </View>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerClassName="gap-2 px-4 pb-3" accessibilityRole="tablist" accessibilityLabel="Ferramentas da matéria">
          {TABS.map((item) => {
            const active = tab === item.id;
            return (
              <Pressable
                key={item.id}
                onPress={() => setTab(item.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                className={`min-w-[104px] flex-row items-center justify-center gap-1.5 rounded-full border px-3 py-2 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'}`}
              >
                <Icon name={item.icon} size={15} color={active ? '#ffffff' : '#475569'} />
                <Text className={`text-[13px] font-medium ${active ? 'text-white' : 'text-slate-600'}`}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView className="flex-1 border-t border-slate-100" contentContainerClassName="px-4 pt-4" contentContainerStyle={{ paddingBottom: bottomInset }}>
          {tab === 'overview' ? <SubjectOverview subject={subject} insights={insights} /> : null}
          {tab === 'questions' ? <SubjectQuestions subject={subject} saved={savedQuestions} onSave={(data) => saveSubjectArtifact(subject.name, 'questions', data)} /> : null}
          {tab === 'exam' ? <SubjectExam subject={subject} savedExam={savedExam} savedResult={examResult} onResult={(data) => saveSubjectArtifact(subject.name, 'examResult', data)} /> : null}
          {tab === 'podcast' ? (
            <PodcastPlayer
              subject={subject}
              saved={savedPodcast}
              savedVariants={savedPodcasts?.formats}
              onSave={(data) => {
                saveSubjectArtifact(subject.name, 'podcast', data);
                if (savedPodcasts?.formats) saveSubjectArtifact(subject.name, 'podcasts', { ...savedPodcasts, formats: { ...savedPodcasts.formats, [data.format || 'dialogue']: data } });
              }}
            />
          ) : null}
          {tab === 'lesson' ? (
            <View className="gap-6">
              <VideoRecommendations subject={subject} saved={savedVideoRecommendations} examResult={examResult} onSave={(data) => saveSubjectArtifact(subject.name, 'videoRecommendations', data)} />
              <LessonPlayer subject={subject} saved={savedLesson} onSave={(data) => saveSubjectArtifact(subject.name, 'lesson', data)} />
            </View>
          ) : null}
          {tab === 'plan' ? (
            <StudyPlan
              subject={subject}
              savedPlan={savedPlan}
              savedProgress={savedPlanProgress}
              savedLessons={savedVideoRecommendations?.videos?.filter((video) => video.saved) || []}
              onSave={(data) => saveSubjectArtifact(subject.name, 'plan', data)}
              onProgressSave={(data) => saveSubjectArtifact(subject.name, 'planProgress', data)}
            />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

function SubjectOverview({ subject, insights }) {
  return (
    <View className="gap-4">
      <View className="gap-1">
        <View className="flex-row items-center gap-1.5">
          <Icon name="layers" size={13} color="#4f46e5" />
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Painel inteligente</Text>
        </View>
        <Text className="text-[17px] font-bold text-slate-900">Mapa, revisão e domínio de {subject.name}</Text>
        <Text className="text-[13px] leading-5 text-slate-600">Uma visão pronta para mostrar o que estudar, onde está fraco e como revisar hoje.</Text>
      </View>

      <InsightBlock icon="route" title="Mapa da matéria">
        <View className="gap-2">
          {insights.map.map((item) => (
            <View key={item.topic} className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <View className="h-8 w-8 items-center justify-center rounded-xl bg-indigo-50">
                <Text className="text-[11px] font-bold text-indigo-600">{String(item.order).padStart(2, '0')}</Text>
              </View>
              <View className="flex-1">
                <Text className="text-[13px] font-bold text-slate-900">{item.topic}</Text>
                <Text className="text-[11px] text-slate-500">{item.status}{item.mastery !== null ? ` · ${item.mastery}%` : ` · ${item.noteCount} nota${item.noteCount === 1 ? '' : 's'}`}</Text>
              </View>
            </View>
          ))}
        </View>
      </InsightBlock>

      <InsightBlock icon="target" title="Radar de dificuldade">
        <View className="gap-2">
          {insights.radar.slice(0, 6).map((item) => (
            <View key={item.topic} className="gap-1 rounded-2xl bg-white px-3 py-3">
              <View className="flex-row items-center justify-between gap-3">
                <View className="flex-1">
                  <Text className="text-[13px] font-bold text-slate-900">{item.topic}</Text>
                  <Text className="text-[11px] text-slate-500">{item.label}</Text>
                </View>
                <Text className="text-[12px] font-bold text-indigo-600">{item.percent}%</Text>
              </View>
              <View className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <View className="h-full rounded-full bg-indigo-500" style={{ width: `${Math.max(6, item.percent)}%` }} />
              </View>
            </View>
          ))}
        </View>
      </InsightBlock>

      <InsightBlock icon="clock" title="Revisão do dia">
        <View className="gap-2">
          {insights.reviewToday.map((task) => (
            <View key={`${task.label}-${task.topic}`} className="gap-1 rounded-2xl bg-emerald-50 px-3 py-3">
              <Text className="text-[11px] font-semibold text-emerald-700">{task.label} · {task.minutes} min</Text>
              <Text className="text-[13px] font-bold text-slate-900">{task.text}</Text>
              <Text className="text-[11px] text-slate-500">{task.topic}</Text>
            </View>
          ))}
        </View>
      </InsightBlock>

      <InsightBlock icon="cards" title="Flashcards automáticos">
        <View className="gap-2">
          {insights.flashcards.slice(0, 6).map((card, index) => (
            <View key={`${card.front}-${index}`} className="gap-1 rounded-2xl bg-indigo-50 px-3 py-3">
              <Text className="text-[11px] font-semibold text-indigo-600">{card.topic}</Text>
              <Text className="text-[13px] font-bold text-slate-900">{card.front}</Text>
              <Text className="text-[12px] leading-5 text-slate-600">{card.back}</Text>
            </View>
          ))}
        </View>
      </InsightBlock>

      <InsightBlock icon="history" title={subject.name === 'História' ? 'Linha do tempo de História' : 'Sequência de estudo'}>
        <View className="gap-2">
          {insights.timeline.map((item) => (
            <View key={item.topic} className="flex-row gap-3 rounded-2xl bg-white px-3 py-3">
              <View className="h-7 w-7 items-center justify-center rounded-full bg-slate-900">
                <Text className="text-[11px] font-bold text-white">{item.marker}</Text>
              </View>
              <View className="flex-1 gap-1">
                <Text className="text-[13px] font-bold text-slate-900">{item.topic}</Text>
                <Text className="text-[12px] leading-5 text-slate-600">{item.text}</Text>
              </View>
            </View>
          ))}
        </View>
      </InsightBlock>
    </View>
  );
}

function InsightBlock({ icon, title, children }) {
  return (
    <View className="gap-2 rounded-2xl bg-slate-50 p-3">
      <View className="flex-row items-center gap-1.5">
        <Icon name={icon} size={15} color="#4f46e5" />
        <Text className="text-[14px] font-bold text-slate-900">{title}</Text>
      </View>
      {children}
    </View>
  );
}

function SubjectQuestions({ subject, saved, onSave }) {
  const [items, setItems] = useState(saved?.questions || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState({});

  async function generate() {
    setLoading(true);
    setError('');
    try {
      const result = await generateSubjectContent(subject, { action: 'questions' });
      if (!result.questions?.length) throw new Error('Não foi possível gerar as perguntas agora.');
      setItems(result.questions);
      setOpen({});
      onSave?.(result);
    } catch (err) {
      setError(err.message || 'Falha ao gerar as perguntas.');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <View className="flex-row items-center gap-2 py-4">
        <Text className="text-[13px] text-slate-500">Criando perguntas sobre {subject.name}...</Text>
      </View>
    );
  }

  if (!items) {
    return (
      <View className="gap-3">
        <View className="gap-1">
          <View className="flex-row items-center gap-1.5">
            <Icon name="question" size={13} color="#4f46e5" />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Perguntas da matéria</Text>
          </View>
          <Text className="text-[16px] font-bold text-slate-900">Perguntas sobre {subject.name} inteira</Text>
          <Text className="text-[13px] text-slate-600">Geramos perguntas de estudo que cruzam todos os subtemas — não apenas uma imagem — com respostas-modelo para você conferir.</Text>
        </View>
        {error ? <View className="rounded-xl bg-red-50 px-3 py-2.5" accessibilityRole="alert"><Text className="text-[13px] text-red-600">{error}</Text></View> : null}
        <Pressable accessibilityRole="button" onPress={generate} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
          <Icon name="sparkle" size={16} color="#ffffff" />
          <Text className="text-[14px] font-semibold text-white">Gerar perguntas</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="gap-2">
        {items.map((item, index) => {
          const isOpen = Boolean(open[index]);
          return (
            <View key={index} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <Pressable accessibilityRole="button" onPress={() => setOpen((o) => ({ ...o, [index]: !o[index] }))} accessibilityState={{ expanded: isOpen }} className="flex-row items-center gap-3 px-3 py-3">
                <View className="flex-1 gap-1">
                  <Text className="text-[11px] text-indigo-500">{item.topic}{item.difficulty ? ` · ${item.difficulty}` : ''}</Text>
                  <Text className="text-[14px] font-semibold text-slate-900">{item.question}</Text>
                </View>
                <Icon name="chevron" size={15} color="#94a3b8" strokeWidth={isOpen ? 2.4 : 1.9} />
              </Pressable>
              {isOpen ? (
                <View className="gap-1 border-t border-slate-100 px-3 py-3">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Resposta-modelo</Text>
                  <Text className="text-[13px] leading-5 text-slate-700">{item.answer}</Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" onPress={generate} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5">
        <Icon name="rotate" size={14} color="#475569" />
        <Text className="text-[13px] font-medium text-slate-600">Gerar novas perguntas</Text>
      </Pressable>
    </View>
  );
}
