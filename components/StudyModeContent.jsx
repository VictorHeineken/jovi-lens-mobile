import { Pressable, Text, View } from 'react-native';
import Icon from './Icon.jsx';

export default function StudyModeContent({
  mode,
  learning,
  quizSelection,
  quizSubmitted,
  onQuizSelect,
  flippedCard,
  onFlipCard,
}) {
  if (mode === 'understand') {
    const content = learning?.understand;
    if (!content) return <EmptyMode text="A explicação ainda não está disponível." />;
    return (
      <View className="gap-4">
        <ModeIntro kicker="Comece pelo conceito" title={content.title} body={content.intro} />
        <View className="gap-3">
          {(content.steps || []).map((step, index) => (
            <StepRow key={`${step.label}-${index}`} index={index} title={step.label} body={step.text} />
          ))}
        </View>
      </View>
    );
  }

  if (mode === 'solve') {
    const content = learning?.solve;
    if (!content) return <EmptyMode text="A resolução ainda não está disponível." />;
    return (
      <View className="gap-4">
        <ModeIntro kicker="Raciocínio guiado" title={content.title} body={content.prompt} />
        <View className="gap-1 rounded-2xl bg-emerald-50 px-4 py-3">
          <Text className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Resposta</Text>
          <Text className="text-[16px] font-bold text-emerald-900">{content.answer}</Text>
        </View>
        <View className="gap-2">
          {(content.steps || []).map((step, index) => (
            <StepRow key={`${step}-${index}`} index={index} body={step} compact />
          ))}
        </View>
      </View>
    );
  }

  if (mode === 'practice') {
    const content = learning?.practice;
    if (!content) return <EmptyMode text="O exercício de prática ainda não está disponível." />;
    return (
      <View className="gap-4">
        <ModeIntro kicker="Teste rápido" title={content.title} body={content.question} />
        <View className="gap-2">
          {(content.options || []).map((option, index) => {
            const selected = quizSelection === index;
            const correct = quizSubmitted && index === content.answerIndex;
            const wrong = quizSubmitted && selected && !correct;
            const border = correct ? 'border-emerald-400 bg-emerald-50' : wrong ? 'border-red-300 bg-red-50' : selected ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 bg-white';
            return (
              <Pressable
                key={option}
                onPress={() => onQuizSelect(index)}
                disabled={quizSubmitted}
                className={`flex-row items-center gap-3 rounded-xl border px-3 py-3 ${border}`}
              >
                <Text className="w-5 text-[13px] font-bold text-slate-400">{String.fromCharCode(65 + index)}</Text>
                <Text className="flex-1 text-[14px] text-slate-800">{option}</Text>
                <Icon name={correct ? 'check' : wrong ? 'close' : 'chevron'} size={16} color={correct ? '#16a34a' : wrong ? '#dc2626' : '#94a3b8'} />
              </Pressable>
            );
          })}
        </View>
        {quizSubmitted ? (
          <View className="flex-row items-start gap-3 rounded-2xl bg-slate-50 px-4 py-3">
            <Icon name={quizSelection === content.answerIndex ? 'check' : 'sparkle'} size={18} color={quizSelection === content.answerIndex ? '#16a34a' : '#4f46e5'} />
            <View className="flex-1 gap-0.5">
              <Text className="text-[14px] font-bold text-slate-900">{quizSelection === content.answerIndex ? 'Você entendeu.' : 'Quase lá.'}</Text>
              <Text className="text-[13px] text-slate-600">{quizSelection === content.answerIndex ? content.feedback : content.hint}</Text>
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  if (mode === 'flashcards') {
    const cards = learning?.flashcards || [];
    if (!cards.length) return <EmptyMode text="Os flashcards ainda não estão disponíveis." />;
    return (
      <View className="gap-4">
        <ModeIntro kicker="Revisão ativa" title="Memorize o essencial" body="Toque em um cartão para revelar a resposta." />
        <View className="gap-2">
          {cards.map((card, index) => {
            const flipped = flippedCard === index;
            return (
              <Pressable
                key={`${card.front}-${index}`}
                onPress={() => onFlipCard(index)}
                className={`gap-1 rounded-2xl border px-4 py-4 ${flipped ? 'border-indigo-300 bg-indigo-50' : 'border-slate-200 bg-white'}`}
              >
                <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">{flipped ? 'Resposta' : 'Pergunta'}</Text>
                <Text className="text-[15px] font-semibold text-slate-900">{flipped ? card.back : card.front}</Text>
                <Text className="text-[11px] text-slate-400">{flipped ? 'Toque para voltar' : 'Toque para revelar'}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return null;
}

function ModeIntro({ kicker, title, body }) {
  return (
    <View className="gap-1">
      <Text className="text-[11px] font-semibold uppercase tracking-wide text-indigo-500">{kicker}</Text>
      <Text className="text-[17px] font-bold text-slate-900">{title}</Text>
      {body ? <Text className="text-[13px] leading-5 text-slate-600">{body}</Text> : null}
    </View>
  );
}

function StepRow({ index, title, body, compact }) {
  return (
    <View className="flex-row gap-3">
      <Text className={`font-bold text-indigo-400 ${compact ? 'text-[13px]' : 'text-[15px]'}`}>{String(index + 1).padStart(2, '0')}</Text>
      <View className="flex-1 gap-0.5">
        {title ? <Text className="text-[14px] font-semibold text-slate-900">{title}</Text> : null}
        <Text className="text-[13px] leading-5 text-slate-600">{body}</Text>
      </View>
    </View>
  );
}

function EmptyMode({ text }) {
  return (
    <View className="items-center gap-2 rounded-2xl border border-dashed border-slate-300 px-6 py-8">
      <Icon name="sparkle" size={20} color="#94a3b8" />
      <Text className="text-center text-[13px] text-slate-500">{text}</Text>
    </View>
  );
}
