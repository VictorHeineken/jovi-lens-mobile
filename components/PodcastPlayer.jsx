import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import Icon from './Icon.jsx';
import { generateSubjectContent } from '../services/subjectStudy.js';
import { narration } from '../services/audio.js';

const SPEAKER_LABEL = { A: 'Ana', B: 'Especialista', narrator: 'Narrador' };

export default function PodcastPlayer({ subject, saved, onSave }) {
  const [format, setFormat] = useState(saved?.format || 'dialogue');
  const [script, setScript] = useState(saved || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [playback, setPlayback] = useState({ index: -1, state: 'idle', mode: null });

  useEffect(() => () => narration.stop(), []);

  async function generate(nextFormat = format) {
    setLoading(true);
    setError('');
    narration.stop();
    setPlayback({ index: -1, state: 'idle', mode: null });
    try {
      const result = await generateSubjectContent(subject, { action: 'podcast-script', format: nextFormat });
      if (!result.segments?.length) throw new Error('Não foi possível gerar o roteiro agora.');
      setScript(result);
      onSave?.(result);
    } catch (err) {
      setError(err.message || 'Falha ao gerar o podcast.');
    } finally {
      setLoading(false);
    }
  }

  function chooseFormat(next) {
    if (next === format) return;
    setFormat(next);
    if (script) generate(next);
  }

  function playFrom(index = 0) {
    if (!script?.segments?.length) return;
    narration.start(script.segments, {
      onUpdate: (u) => setPlayback({ index: u.index, state: u.state, mode: u.mode }),
      onEnd: () => setPlayback({ index: -1, state: 'idle', mode: null }),
    }, index);
  }

  const isPlaying = playback.state === 'playing';
  const isPaused = playback.state === 'paused';

  if (loading) {
    return (
      <View className="flex-row items-center gap-2 py-4">
        <ActivityIndicator color="#4f46e5" />
        <Text className="text-[13px] text-slate-500">Gravando seu podcast de {subject.name}...</Text>
      </View>
    );
  }

  if (!script) {
    return (
      <View className="gap-3">
        <View className="gap-1">
          <View className="flex-row items-center gap-1.5">
            <Icon name="waveform" size={13} color="#4f46e5" />
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">Podcast da matéria</Text>
          </View>
          <Text className="text-[16px] font-bold text-slate-900">Ouça {subject.name} em áudio</Text>
          <Text className="text-[13px] text-slate-600">Transformamos suas notas em um episódio. Escolha o formato e toque para ouvir — a narração usa a voz do dispositivo quando o áudio ao vivo não está configurado.</Text>
        </View>
        <FormatChooser format={format} onChoose={chooseFormat} />
        {error ? <View className="rounded-xl bg-red-50 px-3 py-2.5" accessibilityRole="alert"><Text className="text-[13px] text-red-600">{error}</Text></View> : null}
        <Pressable onPress={() => generate()} className="flex-row items-center justify-center gap-1.5 rounded-xl bg-indigo-600 py-3">
          <Icon name="waveform" size={16} color="#ffffff" />
          <Text className="text-[14px] font-semibold text-white">Gerar podcast</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-3 rounded-2xl bg-indigo-50 p-3">
        <View className="h-14 w-14 items-center justify-center rounded-xl bg-indigo-600">
          <Icon name="waveform" size={26} color="#ffffff" />
        </View>
        <View className="flex-1 gap-0.5">
          <Text className="text-[11px] text-indigo-500">{format === 'dialogue' ? 'Conversa · 2 vozes' : 'Episódio · narrador'}</Text>
          <Text className="text-[15px] font-bold text-slate-900" numberOfLines={2}>{script.title}</Text>
        </View>
      </View>

      <FormatChooser format={format} onChoose={chooseFormat} />

      <View className="flex-row items-center gap-3">
        {isPlaying ? (
          <Pressable onPress={() => narration.pause()} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3">
            <Icon name="pause" size={20} color="#ffffff" />
            <Text className="text-[14px] font-semibold text-white">Pausar</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => (isPaused ? narration.resume() : playFrom(0))} className="flex-1 flex-row items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3">
            <Icon name="play" size={20} color="#ffffff" />
            <Text className="text-[14px] font-semibold text-white">{isPaused ? 'Retomar' : 'Reproduzir'}</Text>
          </Pressable>
        )}
        {isPlaying || isPaused ? (
          <Pressable
            onPress={() => { narration.stop(); setPlayback({ index: -1, state: 'idle', mode: null }); }}
            accessibilityLabel="Parar"
            className="h-12 w-12 items-center justify-center rounded-xl border border-slate-200"
          >
            <Icon name="stop" size={18} color="#475569" />
          </Pressable>
        ) : null}
      </View>
      {playback.mode === 'browser' && (isPlaying || isPaused) ? (
        <View className="flex-row items-center gap-1.5">
          <Icon name="info" size={12} color="#94a3b8" />
          <Text className="text-[11px] text-slate-400">Narração pela voz do dispositivo.</Text>
        </View>
      ) : null}

      <View className="gap-2">
        {script.segments.map((segment, index) => {
          const active = playback.index === index;
          return (
            <Pressable
              key={index}
              onPress={() => playFrom(index)}
              className={`gap-1 rounded-xl border px-3 py-2.5 ${active ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white'} ${segment.speaker === 'B' ? 'ml-6' : ''}`}
            >
              <Text className="text-[11px] font-semibold text-indigo-500">{SPEAKER_LABEL[segment.speaker] || 'Narrador'}</Text>
              <Text className="text-[13px] leading-5 text-slate-700">{segment.text}</Text>
            </Pressable>
          );
        })}
      </View>

      <Pressable onPress={() => generate()} className="flex-row items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2.5">
        <Icon name="rotate" size={14} color="#475569" />
        <Text className="text-[13px] font-medium text-slate-600">Gerar novo episódio</Text>
      </Pressable>
    </View>
  );
}

function FormatChooser({ format, onChoose }) {
  return (
    <View className="flex-row gap-2" accessibilityRole="tablist" accessibilityLabel="Formato do podcast">
      <Pressable
        onPress={() => onChoose('dialogue')}
        accessibilityRole="tab"
        accessibilityState={{ selected: format === 'dialogue' }}
        className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 ${format === 'dialogue' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'}`}
      >
        <Icon name="user" size={14} color={format === 'dialogue' ? '#ffffff' : '#475569'} />
        <Text className={`text-[13px] font-medium ${format === 'dialogue' ? 'text-white' : 'text-slate-600'}`}>Dois apresentadores</Text>
      </Pressable>
      <Pressable
        onPress={() => onChoose('single')}
        accessibilityRole="tab"
        accessibilityState={{ selected: format === 'single' }}
        className={`flex-1 flex-row items-center justify-center gap-1.5 rounded-xl border px-3 py-2.5 ${format === 'single' ? 'border-indigo-600 bg-indigo-600' : 'border-slate-200 bg-white'}`}
      >
        <Icon name="mic" size={14} color={format === 'single' ? '#ffffff' : '#475569'} />
        <Text className={`text-[13px] font-medium ${format === 'single' ? 'text-white' : 'text-slate-600'}`}>Narrador único</Text>
      </Pressable>
    </View>
  );
}
