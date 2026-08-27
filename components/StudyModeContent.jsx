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
      <div className="mode-content">
        <div className="mode-intro"><span className="mode-kicker">Comece pelo conceito</span><h3>{content.title}</h3><p>{content.intro}</p></div>
        <div className="step-list">
          {(content.steps || []).map((step, index) => (
            <div className="study-step" key={`${step.label}-${index}`}>
              <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
              <div><strong>{step.label}</strong><p>{step.text}</p></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'solve') {
    const content = learning?.solve;
    if (!content) return <EmptyMode text="A resolução ainda não está disponível." />;
    return (
      <div className="mode-content">
        <div className="mode-intro"><span className="mode-kicker">Raciocínio guiado</span><h3>{content.title}</h3><p>{content.prompt}</p></div>
        <div className="answer-callout"><span>Resposta</span><strong>{content.answer}</strong></div>
        <div className="step-list compact">
          {(content.steps || []).map((step, index) => <div className="study-step" key={`${step}-${index}`}><span className="step-number">{String(index + 1).padStart(2, '0')}</span><div><p>{step}</p></div></div>)}
        </div>
      </div>
    );
  }

  if (mode === 'practice') {
    const content = learning?.practice;
    if (!content) return <EmptyMode text="O exercício de prática ainda não está disponível." />;
    return (
      <div className="mode-content practice-content">
        <div className="mode-intro"><span className="mode-kicker">Teste rápido</span><h3>{content.title}</h3><p>{content.question}</p></div>
        <div className="quiz-options">
          {(content.options || []).map((option, index) => {
            const selected = quizSelection === index;
            const correct = quizSubmitted && index === content.answerIndex;
            const wrong = quizSubmitted && selected && !correct;
            return <button key={option} className={`${selected ? 'selected ' : ''}${correct ? 'correct ' : ''}${wrong ? 'wrong' : ''}`} onClick={() => onQuizSelect(index)} disabled={quizSubmitted}><span>{String.fromCharCode(65 + index)}</span>{option}<Icon name={correct ? 'check' : wrong ? 'close' : 'chevron'} size={16} /></button>;
          })}
        </div>
        {quizSubmitted && <div className="quiz-feedback"><Icon name={quizSelection === content.answerIndex ? 'check' : 'sparkle'} size={18} /><div><strong>{quizSelection === content.answerIndex ? 'Você entendeu.' : 'Quase lá.'}</strong><p>{quizSelection === content.answerIndex ? content.feedback : content.hint}</p></div></div>}
      </div>
    );
  }

  if (mode === 'flashcards') {
    const cards = learning?.flashcards || [];
    if (!cards.length) return <EmptyMode text="Os flashcards ainda não estão disponíveis." />;
    return (
      <div className="mode-content">
        <div className="mode-intro"><span className="mode-kicker">Revisão ativa</span><h3>Memorize o essencial</h3><p>Toque em um cartão para revelar a resposta.</p></div>
        <div className="flashcard-list">
          {cards.map((card, index) => <button className={`flashcard ${flippedCard === index ? 'flipped' : ''}`} key={`${card.front}-${index}`} onClick={() => onFlipCard(index)}><span>{flippedCard === index ? 'Resposta' : 'Pergunta'}</span><strong>{flippedCard === index ? card.back : card.front}</strong><small>{flippedCard === index ? 'Toque para voltar' : 'Toque para revelar'}</small></button>)}
        </div>
      </div>
    );
  }

  return null;
}

function EmptyMode({ text }) {
  return <div className="mode-empty"><Icon name="sparkle" size={20} /><p>{text}</p></div>;
}
