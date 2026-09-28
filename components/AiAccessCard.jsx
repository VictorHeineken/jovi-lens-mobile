import { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import Icon from './Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { BYOK_PROVIDERS, refresh, removeByok, saveByok, useAiAccess } from '../services/aiAccess.js';
import { confirmAction } from '../services/confirm.js';
import { isDemoMode } from '../services/env.js';

const FREE_CREDITS = 3;

const PROVIDER_LABELS = { gemini: 'Gemini', openai: 'OpenAI', minimax: 'MiniMax' };

const PROVIDER_HELP = {
  gemini: 'Crie uma chave gratuita em aistudio.google.com (sem cartão). No plano gratuito o Google pode usar o conteúdo para melhorar seus produtos.',
  openai: 'Crie uma chave de projeto em platform.openai.com e defina um limite de gastos mensal para o projeto.',
  minimax: 'Use uma chave dedicada e mantenha um saldo baixo. Transcrição por voz usa o reconhecimento do aparelho.',
};

// Perfil's "Sua IA" section: free credits left on the Google account, or the
// user's own AI key (BYOK). Sign-in lives in the account card above it, so
// this renders only while signed in (and never in the demo build).
export default function AiAccessCard({ onMessage }) {
  const { user } = useAppData();
  const { creditsRemaining, byok } = useAiAccess();

  useEffect(() => {
    if (user) refresh();
  }, [user]);

  if (!user || isDemoMode()) return null;

  return (
    <>
      <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-5">
        <Text className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Sua IA</Text>
        {byok ? (
          <>
            <Text className="text-[16px] font-bold text-slate-900">Usando sua chave · {PROVIDER_LABELS[byok.provider] || byok.provider} · {byok.masked}</Text>
            <Text className="text-[13px] text-slate-600">Sem limite de créditos do JOVI Lens — o uso é cobrado na sua conta do provedor.</Text>
          </>
        ) : (
          <>
            <Text className="text-[16px] font-bold text-slate-900">Análises gratuitas: {creditsRemaining ?? '–'} de {FREE_CREDITS}</Text>
            <View className="h-2 overflow-hidden rounded-full bg-slate-100" accessibilityLabel={`${creditsRemaining ?? 0} de ${FREE_CREDITS} análises gratuitas restantes`}>
              <View className="h-2 rounded-full bg-indigo-600" style={{ width: `${(Math.max(0, creditsRemaining ?? 0) / FREE_CREDITS) * 100}%` }} />
            </View>
            <Text className="text-[13px] text-slate-600">Cada análise de foto, pergunta, plano, prova, podcast, aula, recomendação ou correção de resposta usa 1.</Text>
          </>
        )}
      </View>

      <ByokCard byok={byok} onMessage={onMessage} />
    </>
  );
}

function ByokCard({ byok, onMessage }) {
  const [provider, setProvider] = useState(byok?.provider || 'gemini');
  const [apiKey, setApiKey] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function handleSave() {
    if (!apiKey.trim() || saving) return;
    setSaving(true);
    setError('');
    try {
      await saveByok(provider, apiKey);
      // The key only lives in secure store; state keeps the masked preview.
      setApiKey('');
      setEditing(false);
      onMessage('Chave validada e salva neste aparelho.');
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível validar a chave.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    const confirmed = await confirmAction({ title: 'Remover chave', message: 'Remover sua chave de IA deste aparelho?', confirmLabel: 'Remover', destructive: true });
    if (!confirmed) return;
    await removeByok();
    setEditing(false);
    onMessage('Chave removida deste aparelho.');
  }

  return (
    <View className="gap-3 rounded-2xl border border-slate-200 bg-white p-5">
      <Text className="text-[16px] font-bold text-slate-900">Usar minha própria chave</Text>

      {byok && !editing ? (
        <>
          <View className="flex-row items-center gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
            <Icon name="lock" size={15} color="#475569" />
            <Text className="flex-1 text-[13px] text-slate-700">{PROVIDER_LABELS[byok.provider] || byok.provider} · {byok.masked}</Text>
          </View>
          <View className="flex-row gap-2">
            <Pressable accessibilityRole="button" onPress={() => { setProvider(byok.provider); setEditing(true); }} className="flex-1 items-center rounded-xl border border-slate-200 py-2.5">
              <Text className="text-[13px] font-semibold text-slate-600">Trocar chave</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={handleRemove} className="flex-1 items-center rounded-xl border border-red-200 bg-red-50 py-2.5">
              <Text className="text-[13px] font-semibold text-red-600">Remover chave</Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <View className="flex-row gap-2" accessibilityRole="radiogroup" accessibilityLabel="Provedor de IA">
            {BYOK_PROVIDERS.map((item) => {
              const active = item === provider;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => setProvider(item)}
                  className={`flex-1 items-center rounded-full border py-2 ${active ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-slate-50'}`}
                >
                  <Text className={`text-[13px] font-medium ${active ? 'text-white' : 'text-slate-600'}`}>{PROVIDER_LABELS[item]}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text className="text-[12px] text-slate-500">{PROVIDER_HELP[provider]}</Text>
          <TextInput
            value={apiKey}
            onChangeText={setApiKey}
            placeholder="Cole sua chave de IA"
            accessibilityLabel="Chave de IA"
            secureTextEntry
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            importantForAutofill="no"
            textContentType="none"
            className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-[14px] text-slate-900"
            placeholderTextColor="#94a3b8"
          />
          {error ? <View className="rounded-xl bg-red-50 px-3 py-2.5" accessibilityRole="alert"><Text className="text-[13px] text-red-600">{error}</Text></View> : null}
          <Pressable accessibilityRole="button" onPress={handleSave} disabled={saving || !apiKey.trim()} accessibilityState={{ disabled: saving || !apiKey.trim(), busy: saving }} className={`items-center rounded-xl py-3 ${saving || !apiKey.trim() ? 'bg-indigo-300' : 'bg-indigo-600'}`}>
            <Text className="text-[14px] font-semibold text-white">{saving ? 'Validando…' : 'Validar e salvar'}</Text>
          </Pressable>
          {byok ? (
            <Pressable accessibilityRole="button" onPress={() => { setApiKey(''); setError(''); setEditing(false); }} className="items-center py-1">
              <Text className="text-[13px] font-medium text-slate-500">Cancelar</Text>
            </Pressable>
          ) : null}
        </>
      )}

      <Text className="text-[11px] text-slate-400">Sua chave fica criptografada neste aparelho e é enviada apenas para processar cada pedido; o JOVI Lens não a armazena.</Text>
    </View>
  );
}
