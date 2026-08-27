const DEMO_ANALYSIS = {
  text: 'A área de um círculo é dada por A = πr².\nSe r = 4 cm, então A = π · 4² = 16π cm².',
  language: 'pt',
  title: 'Área do círculo',
  summary: 'O exercício pede a área de um círculo a partir do raio. A ideia central é elevar o raio ao quadrado e multiplicar pelo número π.',
  keyPoints: [
    'A fórmula é A = πr².',
    'O raio informado é 4 cm.',
    'O resultado exato é 16π cm²; aproximadamente 50,3 cm².',
  ],
  category: 'Matemática',
  contentType: 'Exercício',
  subject: 'Geometria',
  confidence: 0.96,
  suggestedQuestions: [
    'Por que o raio fica ao quadrado?',
    'Como eu resolveria se o diâmetro fosse 8 cm?',
    'Me dê um exemplo parecido.',
  ],
  learning: {
    understand: {
      title: 'Primeiro, entenda a ideia',
      intro: 'A área mede quanto espaço existe dentro do círculo. Por isso, usamos o raio duas vezes na fórmula.',
      steps: [
        { label: 'Fórmula', text: 'A = πr² representa a área em função do raio.' },
        { label: 'Substituição', text: 'Troque r pelo valor do enunciado: A = π · 4².' },
        { label: 'Leitura', text: 'O resultado exato é 16π cm². Em decimal, fica cerca de 50,3 cm².' },
      ],
    },
    solve: {
      title: 'Resolução passo a passo',
      prompt: 'Calcule a área de um círculo com raio de 4 cm.',
      answer: '16π cm² ≈ 50,3 cm²',
      steps: [
        'Identifique o raio: r = 4 cm.',
        'Aplique a fórmula: A = π · 4².',
        'Calcule a potência: 4² = 16.',
        'Conclua: A = 16π cm² ≈ 50,3 cm².',
      ],
    },
    practice: {
      title: 'Agora é com você',
      question: 'Qual é a área de um círculo com raio de 3 cm?',
      options: ['3π cm²', '6π cm²', '9π cm²', '12π cm²'],
      answerIndex: 2,
      feedback: 'Isso! Como A = πr², temos A = π · 3² = 9π cm².',
      hint: 'Substitua o raio na fórmula e faça a potência antes de multiplicar por π.',
    },
    flashcards: [
      { front: 'Qual é a fórmula da área do círculo?', back: 'A = πr²' },
      { front: 'O que significa r na fórmula?', back: 'É o raio do círculo.' },
      { front: 'Qual é a área para r = 4 cm?', back: '16π cm², aproximadamente 50,3 cm².' },
    ],
  },
};

const DEMO_ANSWERS = {
  'Por que o raio fica ao quadrado?': 'Porque a área mede duas dimensões. Ao multiplicar o raio por ele mesmo, a fórmula transforma uma medida linear em uma medida de superfície.',
  'Como eu resolveria se o diâmetro fosse 8 cm?': 'O raio é metade do diâmetro, então r = 4 cm. A área volta a ser A = π · 4² = 16π cm², aproximadamente 50,3 cm².',
  'Me dê um exemplo parecido.': 'Imagine um círculo com raio de 5 cm. A área seria A = π · 5² = 25π cm², ou cerca de 78,5 cm².',
};

export function getDemoAnalysis() {
  return structuredClone(DEMO_ANALYSIS);
}

export function getDemoAction({ action = 'explain', question = '' } = {}) {
  const analysis = getDemoAnalysis();

  if (action === 'extract') return { action, text: analysis.text, language: analysis.language, confidence: analysis.confidence };

  if (action === 'ask') {
    const normalizedQuestion = String(question || '').trim();
    return {
      action,
      reply: DEMO_ANSWERS[normalizedQuestion] || 'Pense na fórmula A = πr²: qual valor você já conhece e qual precisa descobrir? Se quiser, posso explicar esse passo de outro jeito.',
    };
  }

  if (action === 'quiz') return { action, learning: { practice: analysis.learning.practice } };
  if (action === 'flashcards') return { action, learning: { flashcards: analysis.learning.flashcards } };
  if (action === 'solve') return { action, learning: { solve: analysis.learning.solve } };
  return { action: 'explain', learning: { understand: analysis.learning.understand } };
}

export { DEMO_ANALYSIS };
