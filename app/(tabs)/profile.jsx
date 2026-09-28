import { useState } from 'react';
import { Image, Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Icon from '../../components/Icon.jsx';
import AiAccessCard from '../../components/AiAccessCard.jsx';
import CalendarCard from '../../components/CalendarCard.jsx';
import ExamRemindersCard from '../../components/ExamRemindersCard.jsx';
import { useTopInset } from '../../hooks/safeArea.js';
import { useAnnounce } from '../../hooks/announce.js';
import { useToast } from '../../shared/toast.js';
import { useAppData } from '../../context/AppDataContext.jsx';
import { createBackup, downloadBackup, readBackupFile } from '../../services/dataTransfer.js';
import { confirmAction } from '../../services/confirm.js';
import { signIn, signOut } from '../../services/googleAuth.js';
import { isDemoMode } from '../../services/env.js';
import { createDemoOutlookCalendar, daysUntilEvent, EMPTY_STUDY_CALENDAR, formatEventDate } from '../../shared/studyCalendar.js';

const STUDY_GOAL_OPTIONS = [
  { value: 'vestibular', label: 'Vestibular' },
  { value: 'enem', label: 'ENEM' },
  { value: 'school_exam', label: 'Prova da escola' },
  { value: 'general', label: 'Revisão geral' },
];
const STUDY_CONTEXT_OPTIONS = [
  { value: 'classes', label: 'Acompanhar aulas' },
  { value: 'exam_season', label: 'Período de provas' },
  { value: 'catch_up', label: 'Recuperar atrasos' },
  { value: 'maintenance', label: 'Manter revisão' },
];
const WEEKLY_PACE_OPTIONS = [
  { value: 'light', label: 'Leve · 15 min/dia' },
  { value: 'regular', label: 'Regular · 30 min/dia' },
  { value: 'intense', label: 'Intensivo · 60 min/dia' },
];
const PRACTICE_MODE_OPTIONS = [
  { value: 'concept_first', label: 'Entender primeiro' },
  { value: 'questions_first', label: 'Questões primeiro' },
  { value: 'mixed', label: 'Misto' },
];
const REVIEW_METHOD_OPTIONS = [
  { value: 'spaced', label: 'Revisão espaçada' },
  { value: 'retrieval', label: 'Teste ativo' },
  { value: 'interleaved', label: 'Misturar temas' },
  { value: 'flashcards', label: 'Flashcards' },
];
const VIDEO_STYLE_OPTIONS = [
  { value: 'animated', label: 'Animada e visual' },
  { value: 'balanced', label: 'Equilibrada' },
  { value: 'calm', label: 'Calma e detalhada' },
  { value: 'exam', label: 'Focada em exercícios' },
];
const DURATION_OPTIONS = [
  { value: 'short', label: 'Curta · até 15 min' },
  { value: 'standard', label: 'Média · 15 a 40 min' },
  { value: 'long', label: 'Aprofundada · mais de 40 min' },
];
const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Estou começando' },
  { value: 'intermediate', label: 'Já tenho base' },
  { value: 'advanced', label: 'Quero aprofundar' },
];

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return `${parts[0][0]}${parts.length > 1 ? parts[parts.length - 1][0] : ''}`.toUpperCase();
}

export default function ProfileScreen() {
  const { user, setUser, records, notes, aiHistory, subjectArtifacts, learningPreferences, setLearningPreferences, studyCalendar, setStudyCalendar, restoreLocalData, clearLocalData } = useAppData();
  // Floating, auto-dismissing feedback: the old inline message rendered at the
  // very bottom of a ~6,000px page, out of sight of the button that caused it.
  const [authMessage, setAuthMessage] = useToast(3600);
  const [exporting, setExporting] = useState(false);
  useAnnounce(authMessage);
  const topInset = useTopInset();
  const demo = isDemoMode();

  async function handleGoogleSignIn() {
    try {
      const googleUser = await signIn();
      if (googleUser) setAuthMessage('Login com Google realizado.');
    } catch (error) {
      setAuthMessage(error.message || 'Não foi possível entrar com o Google.');
    }
  }

  async function handleSignOut() {
    await signOut();
    setAuthMessage('Você saiu da conta.');
  }

  // Undoes what "Preparar demo" set up: the demo Outlook agenda goes too,
  // otherwise Hoje kept greeting Ana and listing fake exams.
  function leaveDemoAccount() {
    setUser(null);
    if (studyCalendar.account === createDemoOutlookCalendar().account) setStudyCalendar(EMPTY_STUDY_CALENDAR);
    setAuthMessage('Você saiu da conta.');
  }

  async function exportData() {
    if (exporting) return;
    setExporting(true);
    try {
      const { data, summary } = await createBackup({ records, notes, aiHistory, user, subjectArtifacts, learningPreferences, studyCalendar });
      const shared = await downloadBackup(data);
      const extras = [
        summary.skippedVideos ? `${summary.skippedVideos} vídeo(s) não entram no backup` : '',
        summary.unreadable ? `${summary.unreadable} foto(s) não puderam ser lidas` : '',
        summary.skippedForSize ? `${summary.skippedForSize} foto(s) ficaram de fora pelo limite de tamanho` : '',
      ].filter(Boolean).join('; ');
      setAuthMessage(shared
        ? `Backup pronto: ${notes.length} notas e ${summary.photos} fotos.${extras ? ` ${extras}.` : ''}`
        : 'O compartilhamento não está disponível neste aparelho.');
    } catch {
      setAuthMessage('Não foi possível gerar o backup agora.');
    } finally {
      setExporting(false);
    }
  }

  function updateLearningPreference(key, value) {
    setLearningPreferences({ ...learningPreferences, [key]: value });
    setAuthMessage('Preferências de aprendizagem atualizadas.');
  }

  function connectOutlookDemo() {
    setStudyCalendar(createDemoOutlookCalendar());
    setAuthMessage('Outlook conectado em modo demo. As provas detectadas já entram no plano de estudo.');
  }

  // Presentation build only: demo student + demo calendar, no real login.
  function preparePresentationDemo() {
    setUser({ id: 'demo-student', name: 'Ana Beatriz', email: 'ana.beatriz@demo.jovi', picture: '' });
    setStudyCalendar(createDemoOutlookCalendar());
    setAuthMessage('Modo apresentação pronto: estudante demo, História e provas do Outlook já estão preparados.');
  }

  function disconnectOutlookDemo() {
    setStudyCalendar(EMPTY_STUDY_CALENDAR);
    setAuthMessage('Calendário desconectado.');
  }

  async function importData() {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    try {
      const backup = await readBackupFile(picked.assets[0]);
      const confirmed = await confirmAction({
        title: 'Importar backup',
        message: 'Importar este backup vai substituir suas notas, histórico e preferências locais. As fotos serão mescladas. Continuar?',
        confirmLabel: 'Continuar',
      });
      if (!confirmed) return;
      setAuthMessage('Restaurando backup...');
      const result = await restoreLocalData(backup);
      setAuthMessage(`Backup restaurado: ${result.notes} notas e ${result.records} fotos.${result.failedRecords ? ` ${result.failedRecords} foto(s) não vieram no arquivo ou não puderam ser gravadas.` : ''}`);
    } catch (error) {
      setAuthMessage(error.message || 'Não foi possível restaurar esse backup.');
    }
  }

  async function clearData() {
    const confirmed = await confirmAction({
      title: 'Limpar dados locais',
      message: demo
        ? 'Apagar fotos, notas, histórico e preferências deste aparelho? Os exemplos do app voltam ao estado inicial.'
        : 'Essa ação apaga fotos, notas, histórico e preferências deste aparelho.',
      confirmLabel: 'Apagar',
      destructive: true,
    });
    if (!confirmed) return;
    await clearLocalData();
    setAuthMessage(demo ? 'Dados locais removidos. Os exemplos do app foram restaurados.' : 'Dados locais removidos.');
  }

  return (
    <View className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10" contentContainerStyle={{ paddingTop: topInset }}>
        <View className="flex-row items-center gap-1.5">
          <Icon name="user" size={13} color="#4f46e5" />
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Seu espaço</Text>
        </View>
        <Text className="-mt-2 text-[24px] font-bold text-slate-900">Perfil</Text>
        <Text className="-mt-3 text-[12px] text-slate-500">Seu painel de estudos agora fica na aba Hoje.</Text>

        {demo ? (
          <>
            <View className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
              <View className="h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
                {user ? <Text className="text-[14px] font-bold text-indigo-600">{initialsOf(user.name)}</Text> : <Icon name="user" size={19} color="#4f46e5" />}
              </View>
              <View className="flex-1 gap-0.5">
                <Text className="text-[15px] font-bold text-slate-900">{user ? user.name : 'Conta de demonstração'}</Text>
                <Text className="text-[12px] text-slate-500">{user ? user.email : 'Use "Preparar demo" para entrar como estudante'}</Text>
              </View>
              {user ? (
                <Pressable accessibilityRole="button" onPress={leaveDemoAccount}><Text className="text-[13px] font-medium text-indigo-600">Sair</Text></Pressable>
              ) : null}
            </View>

            <View className="gap-3 rounded-2xl border border-indigo-100 bg-indigo-50 p-4">
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Modo apresentação</Text>
                  <Text className="text-[16px] font-bold text-slate-900">Demo pronta em um toque</Text>
                  <Text className="text-[12px] text-slate-600">Ativa a aluna demo e conecta as provas do Outlook para mostrar o fluxo completo sem criar nada na hora.</Text>
                </View>
                <Icon name="sparkle" size={18} color="#4f46e5" />
              </View>
              <Pressable accessibilityRole="button" onPress={preparePresentationDemo} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
                <Icon name="sparkle" size={16} color="#ffffff" />
                <Text className="text-[14px] font-semibold text-white">Preparar demo</Text>
              </Pressable>
            </View>
          </>
        ) : (
          <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Conta</Text>
            {user ? (
              <View className="flex-row items-center gap-3">
                {user.picture ? (
                  <Image source={{ uri: user.picture }} accessibilityIgnoresInvertColors accessibilityLabel={`Foto de ${user.name}`} className="h-12 w-12 rounded-full" />
                ) : (
                  <View className="h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
                    <Text className="text-[16px] font-bold text-indigo-600">{initialsOf(user.name)}</Text>
                  </View>
                )}
                <View className="flex-1 gap-0.5">
                  <Text className="text-[15px] font-bold text-slate-900">{user.name}</Text>
                  <Text className="text-[12px] text-slate-500">{user.email}</Text>
                </View>
                <Pressable accessibilityRole="button" onPress={handleSignOut}><Text className="text-[13px] font-medium text-indigo-600">Sair</Text></Pressable>
              </View>
            ) : (
              <>
                <Text className="text-[16px] font-bold text-slate-900">Entre para usar a IA</Text>
                <Text className="text-[13px] text-slate-600">Cada conta Google ganha 3 análises gratuitas.</Text>
                <Pressable accessibilityRole="button" onPress={handleGoogleSignIn} className="mt-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
                  <Icon name="user" size={16} color="#ffffff" />
                  <Text className="text-[14px] font-semibold text-white">Entrar com Google</Text>
                </Pressable>
              </>
            )}
          </View>
        )}

        <AiAccessCard onMessage={setAuthMessage} />

        <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-slate-900">Seu plano de estudo</Text>
              <Text className="text-[12px] text-slate-500">Usamos essas escolhas nas perguntas, simulados, podcasts, planos e recomendações de vídeo.</Text>
            </View>
            <Icon name="sparkle" size={18} color="#4f46e5" />
          </View>
          <View className="flex-row flex-wrap gap-1.5">
            {['Perguntas alinhadas', 'Simulado no foco', 'Vídeos no seu foco'].map((item) => (
              <View key={item} className="rounded-full border border-indigo-100 bg-indigo-50 px-2.5 py-1">
                <Text className="text-[11px] font-semibold text-indigo-600">{item}</Text>
              </View>
            ))}
          </View>
          <PreferenceField label="Objetivo principal" options={STUDY_GOAL_OPTIONS} value={learningPreferences.studyGoal} onChange={(v) => updateLearningPreference('studyGoal', v)} />
          <PreferenceField label="Estratégia geral" options={STUDY_CONTEXT_OPTIONS} value={learningPreferences.studyContext} onChange={(v) => updateLearningPreference('studyContext', v)} />
          <PreferenceField label="Ritmo de estudo" options={WEEKLY_PACE_OPTIONS} value={learningPreferences.weeklyPace} onChange={(v) => updateLearningPreference('weeklyPace', v)} />
          <PreferenceField label="Como praticar" options={PRACTICE_MODE_OPTIONS} value={learningPreferences.practiceMode} onChange={(v) => updateLearningPreference('practiceMode', v)} />
          <PreferenceField label="Revisão preferida" options={REVIEW_METHOD_OPTIONS} value={learningPreferences.reviewMethod} onChange={(v) => updateLearningPreference('reviewMethod', v)} />
          <PreferenceField label="Estilo da aula" options={VIDEO_STYLE_OPTIONS} value={learningPreferences.videoStyle} onChange={(v) => updateLearningPreference('videoStyle', v)} />
          <PreferenceField label="Duração preferida" options={DURATION_OPTIONS} value={learningPreferences.duration} onChange={(v) => updateLearningPreference('duration', v)} />
          <PreferenceField label="Nível atual" options={LEVEL_OPTIONS} value={learningPreferences.level} onChange={(v) => updateLearningPreference('level', v)} />
        </View>

        {demo ? (
          <View className={`gap-3 rounded-2xl border p-4 ${studyCalendar.connected ? 'border-indigo-200 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
            <View className="flex-row items-start justify-between gap-2">
              <View className="flex-1">
                <Text className="text-[15px] font-bold text-slate-900">Calendário de provas</Text>
                <Text className="text-[12px] text-slate-500">Use o Outlook para ajustar o plano por matéria com datas reais.</Text>
              </View>
              <Icon name="calendar" size={18} color="#4f46e5" />
            </View>
            {studyCalendar.connected ? (
              <>
                <View className="rounded-xl bg-white px-3 py-2">
                  <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Outlook conectado</Text>
                  <Text className="text-[12px] text-slate-600">{studyCalendar.account}</Text>
                </View>
                <View className="gap-2">
                  {studyCalendar.events.slice(0, 3).map((event) => (
                    <View key={event.id} className="rounded-xl border border-indigo-100 bg-white px-3 py-2.5">
                      <Text className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">{event.subject}</Text>
                      <Text className="text-[13px] font-bold text-slate-900">{event.title}</Text>
                      <Text className="text-[11px] text-slate-500">{formatEventDate(event)} · em {daysUntilEvent(event)} dias</Text>
                    </View>
                  ))}
                </View>
                <View className="flex-row gap-2">
                  <Pressable accessibilityRole="button" onPress={connectOutlookDemo} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-2.5">
                    <Icon name="rotate" size={14} color="#ffffff" />
                    <Text className="text-[12px] font-semibold text-white">Atualizar</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" onPress={disconnectOutlookDemo} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-2.5">
                    <Icon name="close" size={14} color="#475569" />
                    <Text className="text-[12px] font-semibold text-slate-600">Desconectar</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <>
                <Text className="text-[13px] leading-5 text-slate-600">Ao conectar, o JOVI detecta eventos de prova e muda a prioridade do plano automaticamente.</Text>
                <Pressable accessibilityRole="button" onPress={connectOutlookDemo} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
                  <Icon name="calendar" size={16} color="#ffffff" />
                  <Text className="text-[14px] font-semibold text-white">Conectar Outlook · Demo</Text>
                </Pressable>
              </>
            )}
            <Text className="text-[11px] text-slate-400">Demo local: nenhum login Microsoft real é feito nesta versão.</Text>
          </View>
        ) : null}

        {demo ? null : <CalendarCard />}

        {/* Also shown in the presentation build: reminders work off the demo calendar. */}
        <ExamRemindersCard />

        <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-slate-900">Seus dados</Text>
              <Text className="text-[12px] text-slate-500">Faça uma cópia local ou restaure um backup anterior.</Text>
            </View>
            <Icon name="download" size={18} color="#64748b" />
          </View>
          <View className="flex-row gap-2">
            <Pressable accessibilityRole="button" accessibilityState={{ busy: exporting, disabled: exporting }} disabled={exporting} onPress={exportData} className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5 ${exporting ? 'opacity-60' : ''}`}>
              <Icon name="download" size={14} color="#475569" />
              <Text className="text-[13px] font-medium text-slate-600">{exporting ? 'Preparando...' : 'Exportar backup'}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={importData} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5">
              <Icon name="upload" size={14} color="#475569" />
              <Text className="text-[13px] font-medium text-slate-600">Importar backup</Text>
            </Pressable>
          </View>
          <Text className="text-[11px] text-slate-400">O arquivo fica no seu dispositivo. A importação mescla mídias pelo identificador e substitui notas, histórico e preferências locais.</Text>
        </View>

        <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-slate-900">Privacidade local</Text>
              <Text className="text-[12px] text-slate-500">Remova o conteúdo criado neste aparelho quando quiser.</Text>
            </View>
            <Icon name="lock" size={18} color="#64748b" />
          </View>
          <Pressable accessibilityRole="button" onPress={clearData} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2.5">
            <Icon name="trash" size={14} color="#dc2626" />
            <Text className="text-[13px] font-medium text-red-600">Limpar dados locais</Text>
          </Pressable>
          <Text className="text-[11px] text-slate-400">{demo ? 'Essa ação apaga fotos, notas, histórico e artefatos do Estúdio deste dispositivo. Ela não remove os exemplos do app.' : 'Essa ação apaga fotos, notas, histórico e preferências deste aparelho.'}</Text>
        </View>

      </ScrollView>
      {authMessage ? (
        <View className="absolute left-4 right-4 flex-row items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3" style={{ top: topInset }} accessibilityLiveRegion="polite">
          <Icon name="info" size={15} color="#ffffff" />
          <Text className="flex-1 text-[13px] font-medium text-white">{authMessage}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PreferenceField({ label, options, value, onChange }) {
  return (
    <View className="gap-1.5">
      <Text className="text-[12px] font-semibold text-slate-600">{label}</Text>
      <View className="flex-row flex-wrap gap-1.5">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              accessibilityRole="button"
              key={option.value}
              onPress={() => onChange(option.value)}
              accessibilityState={{ selected: active }}
              className={`rounded-full border px-3 py-1.5 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-slate-50'}`}
            >
              <Text className={`text-[12px] font-medium ${active ? 'text-white' : 'text-slate-600'}`}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// A crash here stays inside this tab (the tab bar keeps working).
export { default as ErrorBoundary } from '../../components/ErrorScreen.jsx';
