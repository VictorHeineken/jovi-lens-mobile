import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import Icon from './Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { findYouTubeLessons } from '../services/youtubeRecommendations.js';

function weakTopicsFromExam(examResult) {
  return Object.entries(examResult?.byTopic || {})
    .filter(([, value]) => value.correct < value.total)
    .sort(([, a], [, b]) => (a.correct / a.total) - (b.correct / b.total))
    .map(([topic]) => topic)
    .slice(0, 4);
}

function mergeVideoMetadata(nextVideos = [], previousVideos = []) {
  const previous = new Map(previousVideos.map((video) => [video.id, video]));
  const merged = nextVideos.map((video) => ({ ...video, feedback: previous.get(video.id)?.feedback || null, saved: Boolean(previous.get(video.id)?.saved) }));
  const savedVideos = previousVideos.filter((video) => video.saved && !merged.some((item) => item.id === video.id));
  return [...merged, ...savedVideos].slice(0, 8);
}

export default function YouTubeRecommendations({ subject, saved = null, examResult = null, onSave }) {
  const { learningPreferences } = useAppData();
  const [result, setResult] = useState(saved || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const weakTopics = weakTopicsFromExam(examResult);

  async function search() {
    setLoading(true);
    setError('');
    try {
      const next = await findYouTubeLessons({ ...subject, weakTopics: weakTopicsFromExam(examResult) }, learningPreferences);
      next.videos = mergeVideoMetadata(next.videos, result?.videos || saved?.videos || []);
      setResult(next);
      onSave?.(next);
    } catch (err) {
      setError(err.message || 'Não foi possível buscar uma aula agora.');
    } finally {
      setLoading(false);
    }
  }

  function updateVideo(videoId, patch) {
    if (!result) return;
    const next = { ...result, videos: result.videos.map((video) => (video.id === videoId ? { ...video, ...patch } : video)) };
    setResult(next);
    onSave?.(next);
  }

  return (
    <View className="gap-3">
      <View className="flex-row items-start justify-between gap-2">
        <View className="flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <Icon name="search" size={13} color="#4f46e5" />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Busca inteligente</Text>
          </View>
          <Text className="text-[16px] font-bold text-slate-900">Aulas no YouTube para {subject.name}</Text>
          <Text className="text-[13px] text-slate-600">A IA combina seus subtemas com seu estilo de aprendizagem e entrega links reais para assistir.</Text>
        </View>
        {result?.mode === 'demo' ? (
          <View className="rounded-full bg-amber-100 px-2 py-1"><Text className="text-[10px] font-bold text-amber-700">DEMO</Text></View>
        ) : null}
      </View>

      {result?.query ? (
        <View className="flex-row items-center gap-1.5">
          <Icon name="sparkle" size={13} color="#4f46e5" />
          <Text className="flex-1 text-[12px] text-slate-600">Busca: <Text className="font-semibold text-slate-800">{result.query}</Text></Text>
        </View>
      ) : null}
      {result?.reason ? <Text className="text-[12px] text-slate-500">A seleção {result.reason}.</Text> : null}
      {weakTopics.length ? (
        <View className="flex-row items-start gap-1.5">
          <Icon name="target" size={13} color="#d97706" />
          <Text className="flex-1 text-[12px] text-amber-700">Também priorizando suas dificuldades: <Text className="font-semibold">{weakTopics.join(', ')}</Text></Text>
        </View>
      ) : null}
      {error ? (
        <View className="rounded-xl bg-red-50 px-3 py-2.5" accessibilityRole="alert"><Text className="text-[13px] text-red-600">{error}</Text></View>
      ) : null}

      {!result && !loading ? (
        <Pressable onPress={search} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
          <Icon name="search" size={16} color="#ffffff" />
          <Text className="text-[14px] font-semibold text-white">Encontrar minha aula</Text>
        </Pressable>
      ) : null}

      {loading ? (
        <View className="flex-row items-center gap-2 py-2">
          <ActivityIndicator color="#4f46e5" />
          <Text className="text-[13px] text-slate-500">Procurando uma aula que combine com você…</Text>
        </View>
      ) : null}

      {result && !loading ? (
        <View className="gap-3">
          {result.videos?.length ? (
            result.videos.map((video) => (
              <View key={video.id} className="gap-2 rounded-2xl border border-slate-200 bg-white p-3">
                <View className="flex-row gap-3">
                  <View className="h-16 w-24 items-center justify-center overflow-hidden rounded-lg bg-slate-100">
                    {video.thumbnail ? (
                      <Image source={{ uri: video.thumbnail }} className="h-16 w-24" resizeMode="cover" />
                    ) : (
                      <Icon name="play" size={22} color="#94a3b8" />
                    )}
                  </View>
                  <View className="flex-1 gap-0.5">
                    <Text className="text-[13px] font-bold text-slate-900" numberOfLines={2}>{video.title}</Text>
                    <Text className="text-[11px] text-slate-400">{video.channelTitle}</Text>
                  </View>
                </View>
                <Text className="text-[12px] text-slate-500" numberOfLines={2}>{video.description || 'Vídeo selecionado para esta matéria.'}</Text>
                <View className="flex-row items-center justify-between">
                  <View className="flex-row gap-2">
                    <Pressable onPress={() => Linking.openURL(video.url)} className="flex-row items-center gap-1.5 rounded-full bg-indigo-600 px-3 py-1.5">
                      <Icon name="play" size={13} color="#ffffff" />
                      <Text className="text-[12px] font-medium text-white">Assistir</Text>
                    </Pressable>
                    <Pressable onPress={() => updateVideo(video.id, { saved: !video.saved })} className={`flex-row items-center gap-1.5 rounded-full border px-3 py-1.5 ${video.saved ? 'border-indigo-600 bg-indigo-50' : 'border-slate-200 bg-white'}`}>
                      <Icon name={video.saved ? 'check' : 'bookmark'} size={13} color={video.saved ? '#4f46e5' : '#475569'} />
                      <Text className={`text-[12px] font-medium ${video.saved ? 'text-indigo-600' : 'text-slate-600'}`}>{video.saved ? 'Na trilha' : 'Salvar'}</Text>
                    </Pressable>
                  </View>
                  <View className="flex-row items-center gap-2">
                    <Text className="text-[11px] text-slate-400">Foi útil?</Text>
                    <Pressable
                      onPress={() => updateVideo(video.id, { feedback: video.feedback === 'up' ? null : 'up' })}
                      accessibilityLabel="Vídeo útil"
                      accessibilityState={{ selected: video.feedback === 'up' }}
                      className={`h-7 w-7 items-center justify-center rounded-full ${video.feedback === 'up' ? 'bg-emerald-100' : 'bg-slate-100'}`}
                    >
                      <Text>👍</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => updateVideo(video.id, { feedback: video.feedback === 'down' ? null : 'down' })}
                      accessibilityLabel="Vídeo não útil"
                      accessibilityState={{ selected: video.feedback === 'down' }}
                      className={`h-7 w-7 items-center justify-center rounded-full ${video.feedback === 'down' ? 'bg-red-100' : 'bg-slate-100'}`}
                    >
                      <Text>👎</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View className="flex-row items-center gap-2 rounded-xl border border-dashed border-slate-300 px-3 py-3">
              <Icon name="search" size={18} color="#94a3b8" />
              <Text className="flex-1 text-[13px] text-slate-500">Não encontrei uma aula adequada com esses filtros.</Text>
            </View>
          )}
          <Pressable onPress={search} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5">
            <Icon name="rotate" size={14} color="#475569" />
            <Text className="text-[13px] font-medium text-slate-600">Buscar novamente</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}
