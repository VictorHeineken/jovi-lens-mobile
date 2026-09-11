import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import Icon from './Icon.jsx';
import SubjectExam from './SubjectExam.jsx';
import StudyPlan from './StudyPlan.jsx';
import PodcastPlayer from './PodcastPlayer.jsx';
import LessonPlayer from './LessonPlayer.jsx';
import YouTubeRecommendations from './YouTubeRecommendations.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { useAppData } from '../context/AppDataContext.jsx';

const TABS = [
  { id: 'questions', label: 'Perguntas', icon: 'question' },
  { id: 'exam', label: 'Simulado', icon: 'target' },
  { id: 'podcast', label: 'Podcast', icon: 'waveform' },
  { id: 'lesson', label: 'Vídeo aula', icon: 'film' },
  { id: 'plan', label: 'Plano', icon: 'route' },
];

export default function SubjectStudio({ subject, onClose }) {
  const { saveSubjectArtifact, getSubjectArtifact } = useAppData();
  const [tab, setTab] = useState('questions');

  if (!subject) return null;

  const examResult = getSubjectArtifact(subject.name, 'examResult')?.data || null;
  const savedPlan = getSubjectArtifact(subject.name, 'plan')?.data || null;
  const savedPlanProgress = getSubjectArtifact(subject.name, 'planProgress')?.data || {};
  const savedQuestions = getSubjectArtifact(subject.name, 'questions')?.data || null;
  const savedPodcast = getSubjectArtifact(subject.name, 'podcast')?.data || null;
  const savedLesson = getSubjectArtifact(subject.name, 'lesson')?.data || null;
  const savedYouTubeLessons = getSubjectArtifact(subject.name, 'youtubeLessons')?.data || null;

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} accessibilityViewIsModal>
      <View className="flex-1 bg-white">
        <Pressable
          onPress={onClose}
          accessibilityLabel="Fechar estúdio da matéria"
          className="absolute right-4 top-14 z-10 h-9 w-9 items-center justify-center rounded-full bg-slate-100"
        >
          <Icon name="close" size={20} color="#475569" />
        </Pressable>

        <View className="gap-2 px-4 pb-3 pt-14">
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
                className={`flex-row items-center gap-1.5 rounded-full border px-3 py-2 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'}`}
              >
                <Icon name={item.icon} size={15} color={active ? '#ffffff' : '#475569'} />
                <Text className={`text-[13px] font-medium ${active ? 'text-white' : 'text-slate-600'}`}>{item.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>

        <ScrollView className="flex-1 border-t border-slate-100" contentContainerClassName="px-4 py-4">
          {tab === 'questions' ? <SubjectQuestions subject={subject} saved={savedQuestions} onSave={(data) => saveSubjectArtifact(subject.name, 'questions', data)} /> : null}
          {tab === 'exam' ? <SubjectExam subject={subject} savedResult={examResult} onResult={(data) => saveSubjectArtifact(subject.name, 'examResult', data)} /> : null}
          {tab === 'podcast' ? <PodcastPlayer subject={subject} saved={savedPodcast} onSave={(data) => saveSubjectArtifact(subject.name, 'podcast', data)} /> : null}
          {tab === 'lesson' ? (
            <View className="gap-6">
              <YouTubeRecommendations subject={subject} saved={savedYouTubeLessons} examResult={examResult} onSave={(data) => saveSubjectArtifact(subject.name, 'youtubeLessons', data)} />
              <LessonPlayer subject={subject} saved={savedLesson} onSave={(data) => saveSubjectArtifact(subject.name, 'lesson', data)} />
            </View>
          ) : null}
          {tab === 'plan' ? (
            <StudyPlan
              subject={subject}
              savedPlan={savedPlan}
              savedProgress={savedPlanProgress}
              savedLessons={savedYouTubeLessons?.videos?.filter((video) => video.saved) || []}
              onSave={(data) => saveSubjectArtifact(subject.name, 'plan', data)}
              onProgressSave={(data) => saveSubjectArtifact(subject.name, 'planProgress', data)}
            />
          ) : null}
        </ScrollView>
      </View>
    </Modal>
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
        <Pressable onPress={generate} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
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
              <Pressable onPress={() => setOpen((o) => ({ ...o, [index]: !o[index] }))} accessibilityState={{ expanded: isOpen }} className="flex-row items-center gap-3 px-3 py-3">
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
      <Pressable onPress={generate} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5">
        <Icon name="rotate" size={14} color="#475569" />
        <Text className="text-[13px] font-medium text-slate-600">Gerar novas perguntas</Text>
      </Pressable>
    </View>
  );
}
