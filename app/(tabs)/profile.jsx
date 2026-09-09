import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import Icon from '../../components/Icon.jsx';
import { useAppData } from '../../context/AppDataContext.jsx';
import { isDemoMode } from '../../services/imageAnalysis.js';
import { createBackup, downloadBackup, readBackupFile } from '../../services/dataTransfer.js';

const DEMO_USER = {
  id: 'demo-student',
  name: 'Ana Beatriz',
  email: 'ana.beatriz@demo.jovi',
  picture: '',
};

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
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Melhor combinação' },
  { value: 'viewCount', label: 'Mais populares' },
  { value: 'date', label: 'Mais recentes' },
];

export default function ProfileScreen() {
  const { user, setUser, plan, setPlan, records, notes, aiHistory, subjectArtifacts, learningPreferences, setLearningPreferences, restoreLocalData, clearLocalData } = useAppData();
  const [authMessage, setAuthMessage] = useState('');
  const demoMode = isDemoMode();

  const trialActive = plan.type === 'trial' && new Date(plan.endsAt) > new Date();
  const daysLeft = trialActive ? Math.max(1, Math.ceil((new Date(plan.endsAt) - new Date()) / 86400000)) : 0;

  function enterDemoAccount() {
    setUser(DEMO_USER);
    setAuthMessage('Conta de demonstração ativada. Nenhum login real foi realizado.');
  }

  function leaveDemoAccount() {
    setUser(null);
    setAuthMessage('Você saiu da conta de demonstração.');
  }

  function activateCopilot() {
    if (!user) setUser(DEMO_USER);
    setPlan({ type: 'pro', demo: true, activatedAt: new Date().toISOString() });
    setAuthMessage('Acesso de demonstração ao Copilot ativado. Nenhuma cobrança foi feita.');
  }

  function startTrial() {
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 7 * 86400000);
    if (!user) setUser(DEMO_USER);
    setPlan({ type: 'trial', demo: true, startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() });
    setAuthMessage('Teste de 7 dias ativado para a apresentação. Nenhuma cobrança foi feita.');
  }

  async function exportData() {
    await downloadBackup(createBackup({ records, notes, aiHistory, plan, user, subjectArtifacts, learningPreferences }));
    setAuthMessage('Backup dos seus estudos exportado para este dispositivo.');
  }

  function updateLearningPreference(key, value) {
    setLearningPreferences({ ...learningPreferences, [key]: value });
    setAuthMessage('Preferências de aprendizagem atualizadas.');
  }

  async function importData() {
    const picked = await DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true });
    if (picked.canceled || !picked.assets?.[0]) return;
    try {
      const backup = await readBackupFile(picked.assets[0]);
      Alert.alert(
        'Importar backup',
        'Importar este backup vai substituir suas notas, histórico e preferências locais. As mídias serão mescladas. Continuar?',
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Continuar',
            onPress: async () => {
              const result = await restoreLocalData(backup);
              setAuthMessage(`Backup restaurado: ${result.notes} notas e ${result.records} mídias.`);
            },
          },
        ],
      );
    } catch (error) {
      setAuthMessage(error.message || 'Não foi possível restaurar esse backup.');
    }
  }

  function clearData() {
    Alert.alert(
      'Limpar dados locais',
      'Apagar fotos, notas, histórico e preferências locais? Os exemplos da demonstração serão mantidos.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: async () => {
            await clearLocalData();
            setAuthMessage('Dados locais removidos. Os exemplos da demonstração foram mantidos.');
          },
        },
      ],
    );
  }

  const planTitle = trialActive
    ? `${daysLeft} dias de teste restantes`
    : plan.type === 'pro'
      ? 'Copilot liberado'
      : 'Estude com mais profundidade';

  return (
    <View className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-4 px-4 pb-10 pt-14">
        <View className="flex-row items-center gap-1.5">
          <Icon name="user" size={13} color="#4f46e5" />
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Seu espaço</Text>
        </View>
        <Text className="-mt-2 text-[24px] font-bold text-slate-900">Perfil</Text>

        <View className="flex-row items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="h-12 w-12 items-center justify-center rounded-full bg-indigo-100">
            {user ? <Text className="text-[14px] font-bold text-indigo-600">AB</Text> : <Icon name="user" size={19} color="#4f46e5" />}
          </View>
          <View className="flex-1 gap-0.5">
            <Text className="text-[15px] font-bold text-slate-900">{user ? user.name : 'Conta de demonstração'}</Text>
            <Text className="text-[12px] text-slate-500">{user ? user.email : 'Entre para testar o Copilot da JOVI'}</Text>
          </View>
          {user ? (
            <Pressable onPress={leaveDemoAccount}><Text className="text-[13px] font-medium text-indigo-600">Sair</Text></Pressable>
          ) : null}
        </View>

        {!user ? (
          <View className="gap-2 rounded-2xl border border-slate-200 bg-white p-4">
            <View className="flex-row items-center justify-between">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Fluxo de apresentação</Text>
              <View className="rounded-full bg-amber-100 px-2 py-1"><Text className="text-[10px] font-bold text-amber-700">DEMO · SEM LOGIN REAL</Text></View>
            </View>
            <Text className="text-[16px] font-bold text-slate-900">Entre para continuar sua trilha</Text>
            <Text className="text-[13px] text-slate-600">Este botão representa um futuro login da conta JOVI. Nesta proposta, tudo acontece localmente para você apresentar o produto sem depender de cadastro externo.</Text>
            <Pressable onPress={enterDemoAccount} className="mt-1 flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
              <Icon name="user" size={16} color="#ffffff" />
              <Text className="text-[14px] font-semibold text-white">Entrar como estudante</Text>
            </Pressable>
          </View>
        ) : null}

        <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">JOVI Copilot</Text>
              <Text className="text-[16px] font-bold text-slate-900">{planTitle}</Text>
            </View>
            <Icon name="crown" size={24} color="#d97706" />
          </View>
          <View className="gap-1.5">
            <BenefitLine text="Análises inteligentes de conteúdo" />
            <BenefitLine text="Trilha Entender · Resolver · Praticar" />
            <BenefitLine text="Histórico e notas para revisão" />
          </View>
          {!trialActive && plan.type !== 'pro' ? (
            <Pressable onPress={startTrial} className="items-center rounded-xl bg-indigo-600 py-3">
              <Text className="text-[14px] font-semibold text-white">Testar por 7 dias · Demo</Text>
            </Pressable>
          ) : null}
          {plan.type !== 'pro' ? (
            <Pressable onPress={activateCopilot} className="items-center rounded-xl border border-slate-200 py-3">
              <Text className="text-[14px] font-semibold text-slate-600">Ativar acesso Copilot · Demo</Text>
            </Pressable>
          ) : (
            <View className="flex-row items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5">
              <Icon name="check" size={15} color="#16a34a" />
              <Text className="text-[13px] font-medium text-emerald-700">Acesso demonstrativo ativo</Text>
            </View>
          )}
          <Text className="text-[11px] text-slate-400">Exemplo de apresentação: não há cobrança, assinatura ou login externo neste fluxo.</Text>
        </View>

        <View className="gap-2 rounded-2xl border border-slate-200 bg-white p-4">
          <SettingRow label="Inteligência" value={demoMode ? 'Modo demonstração' : 'Azure OpenAI'} />
          <SettingRow label="Conta" value="Perfil local de estudante" />
          <SettingRow label="Cobrança" value="Não configurada" />
        </View>

        <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-slate-900">Seu jeito de aprender</Text>
              <Text className="text-[12px] text-slate-500">Usamos essas escolhas para encontrar aulas mais adequadas no YouTube.</Text>
            </View>
            <Icon name="sparkle" size={18} color="#4f46e5" />
          </View>
          <PreferenceField label="Estilo da aula" options={VIDEO_STYLE_OPTIONS} value={learningPreferences.videoStyle} onChange={(v) => updateLearningPreference('videoStyle', v)} />
          <PreferenceField label="Duração preferida" options={DURATION_OPTIONS} value={learningPreferences.duration} onChange={(v) => updateLearningPreference('duration', v)} />
          <PreferenceField label="Nível atual" options={LEVEL_OPTIONS} value={learningPreferences.level} onChange={(v) => updateLearningPreference('level', v)} />
          <PreferenceField label="Critério de busca" options={SORT_OPTIONS} value={learningPreferences.sort} onChange={(v) => updateLearningPreference('sort', v)} />
        </View>

        <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-4">
          <View className="flex-row items-start justify-between gap-2">
            <View className="flex-1">
              <Text className="text-[15px] font-bold text-slate-900">Seus dados</Text>
              <Text className="text-[12px] text-slate-500">Faça uma cópia local ou restaure um backup anterior.</Text>
            </View>
            <Icon name="download" size={18} color="#64748b" />
          </View>
          <View className="flex-row gap-2">
            <Pressable onPress={exportData} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5">
              <Icon name="download" size={14} color="#475569" />
              <Text className="text-[13px] font-medium text-slate-600">Exportar backup</Text>
            </Pressable>
            <Pressable onPress={importData} className="flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5">
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
          <Pressable onPress={clearData} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 py-2.5">
            <Icon name="trash" size={14} color="#dc2626" />
            <Text className="text-[13px] font-medium text-red-600">Limpar dados locais</Text>
          </Pressable>
          <Text className="text-[11px] text-slate-400">Essa ação apaga fotos, notas, histórico, plano demonstrativo e artefatos do Estúdio deste dispositivo. Ela não remove os exemplos do app.</Text>
        </View>

        {authMessage ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5" accessibilityRole="status">
            <Icon name="info" size={15} color="#64748b" />
            <Text className="flex-1 text-[13px] text-slate-600">{authMessage}</Text>
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

function BenefitLine({ text }) {
  return (
    <View className="flex-row items-center gap-2">
      <Icon name="check" size={15} color="#16a34a" />
      <Text className="text-[13px] text-slate-700">{text}</Text>
    </View>
  );
}

function SettingRow({ label, value }) {
  return (
    <View className="flex-row items-center justify-between">
      <Text className="text-[13px] text-slate-500">{label}</Text>
      <Text className="text-[13px] font-semibold text-slate-800">{value}</Text>
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
