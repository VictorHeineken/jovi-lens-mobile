import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Icon from './Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

function getTrialState(plan) {
  if (plan.type !== 'trial' || !plan.endsAt) return { active: false, daysLeft: 0 };
  const remaining = new Date(plan.endsAt).getTime() - Date.now();
  return { active: remaining > 0, daysLeft: remaining > 0 ? Math.max(1, Math.ceil(remaining / 86400000)) : 0 };
}

const BENEFITS = [
  { icon: 'scan', title: 'Entende imagens complexas', body: 'Exercícios, textos, gráficos e anotações no mesmo contexto.' },
  { icon: 'question', title: 'Explica no seu ritmo', body: 'Você pode pedir exemplos, simplificar ou aprofundar a resposta.' },
  { icon: 'cards', title: 'Transforma conteúdo em prática', body: 'Gera questões e feedback para reforçar o que foi aprendido.' },
  { icon: 'layers', title: 'Estúdio da matéria', body: 'Simulado, podcast, vídeo aula e plano de estudos a partir de todas as suas notas — em Notas, abra uma matéria.' },
];

export default function CopilotView({ embedded = false }) {
  const router = useRouter();
  const { plan, user, setPlan, setUser } = useAppData();
  const [message, setMessage] = useState('');
  const trial = getTrialState(plan);
  const accessActive = plan.type === 'pro' || trial.active;

  function ensureDemoUser() {
    if (!user) setUser({ id: 'demo-student', name: 'Ana Beatriz', email: 'ana.beatriz@demo.jovi', picture: '' });
  }

  function startTrial() {
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 7 * 86400000);
    ensureDemoUser();
    setPlan({ type: 'trial', demo: true, model: 'copilot-advanced', startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() });
    setMessage('Teste de 7 dias ativado para a apresentação. Nenhuma cobrança foi feita.');
  }

  function connectPaidAccount() {
    ensureDemoUser();
    setPlan({ type: 'pro', demo: true, model: 'copilot-advanced', source: 'existing-subscription', connectedAt: new Date().toISOString() });
    setMessage('Assinatura Copilot conectada neste exemplo. Nenhuma conta real foi consultada.');
  }

  const content = (
    <>
        <View className="flex-row items-center justify-between">
          <View className="gap-1">
            <View className="flex-row items-center gap-1.5">
              <Icon name="sparkle" size={13} color="#4f46e5" />
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Inteligência avançada</Text>
            </View>
            <Text className="text-[24px] font-bold text-slate-900">Copilot</Text>
          </View>
          <View className="rounded-full bg-amber-100 px-2.5 py-1"><Text className="text-[10px] font-bold text-amber-700">DEMO</Text></View>
        </View>

        <View className="gap-3 rounded-2xl bg-indigo-600 p-5">
          <Text className="text-[12px] font-semibold text-indigo-200">JOVI Lens + Copilot</Text>
          <Text className="text-[19px] font-bold text-white">Uma IA mais completa para acompanhar seus estudos.</Text>
          <Text className="text-[13px] text-indigo-100">Teste um modelo avançado para entender imagens, aprofundar explicações e praticar com mais contexto.</Text>
          <View className="mt-1 flex-row items-center gap-1.5 self-start rounded-full bg-white/15 px-3 py-1.5">
            <Icon name="sparkle" size={15} color="#ffffff" />
            <Text className="text-[12px] font-medium text-white">Modelo avançado · exemplo</Text>
          </View>
        </View>

        <View className={`gap-3 rounded-2xl border p-5 ${accessActive ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
          <View className="flex-row items-center gap-3">
            <View className={`h-10 w-10 items-center justify-center rounded-full ${accessActive ? 'bg-emerald-500' : 'bg-slate-200'}`}>
              <Icon name={accessActive ? 'check' : 'lock'} size={20} color={accessActive ? '#ffffff' : '#64748b'} />
            </View>
            <View className="flex-1">
              <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Seu acesso</Text>
              <Text className="text-[16px] font-bold text-slate-900">
                {trial.active ? `Teste ativo · ${trial.daysLeft} ${trial.daysLeft === 1 ? 'dia' : 'dias'} restantes` : plan.type === 'pro' ? 'Copilot conectado' : 'Escolha como experimentar'}
              </Text>
            </View>
          </View>
          {accessActive ? (
            <>
              <Text className="text-[13px] text-slate-600">O modelo avançado está selecionado nesta demonstração. Abra a câmera para continuar uma sessão de estudo.</Text>
              <Pressable onPress={() => router.push('/(tabs)/camera')} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
                <Icon name="camera" size={16} color="#ffffff" />
                <Text className="text-[14px] font-semibold text-white">Abrir câmera com Copilot</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="text-[13px] text-slate-600">Você pode mostrar os dois caminhos de acesso sem criar cadastro, assinatura ou cobrança real.</Text>
              <View className="gap-2">
                <Pressable onPress={startTrial} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
                  <Icon name="sparkle" size={16} color="#ffffff" />
                  <Text className="text-[14px] font-semibold text-white">Testar por 7 dias</Text>
                </Pressable>
                <Pressable onPress={connectPaidAccount} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-3">
                  <Icon name="link" size={16} color="#475569" />
                  <Text className="text-[14px] font-semibold text-slate-600">Já assino o Copilot</Text>
                </Pressable>
              </View>
            </>
          )}
          <Text className="text-[11px] text-slate-400">Demonstração de produto · acesso, modelo e assinatura são ilustrativos.</Text>
        </View>

        <View className="gap-3">
          <View className="flex-row items-center justify-between">
            <View>
              <Text className="text-[12px] text-slate-400">O que muda</Text>
              <Text className="text-[17px] font-bold text-slate-900">Mais profundidade para aprender</Text>
            </View>
            <Icon name="arrow-up-right" size={17} color="#94a3b8" />
          </View>
          <View className="gap-2.5">
            {BENEFITS.map((item) => (
              <View key={item.title} className="flex-row items-start gap-3 rounded-2xl border border-slate-200 bg-white p-3.5">
                <View className="h-9 w-9 items-center justify-center rounded-full bg-indigo-50">
                  <Icon name={item.icon} size={16} color="#4f46e5" />
                </View>
                <View className="flex-1 gap-0.5">
                  <Text className="text-[14px] font-bold text-slate-900">{item.title}</Text>
                  <Text className="text-[12px] text-slate-500">{item.body}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {message ? (
          <View className="flex-row items-center gap-2 rounded-xl bg-slate-100 px-3 py-2.5" accessibilityRole="status">
            <Icon name="info" size={15} color="#64748b" />
            <Text className="flex-1 text-[13px] text-slate-600">{message}</Text>
          </View>
        ) : null}
    </>
  );

  if (embedded) return <View className="gap-5 px-4 pb-6">{content}</View>;

  return (
    <View className="flex-1 bg-white">
      <ScrollView contentContainerClassName="gap-5 px-4 pb-10 pt-14">{content}</ScrollView>
    </View>
  );
}
