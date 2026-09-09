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

// ---------------------------------------------------------------------------
// Subject-level demo content. In Demo Mode the client still aggregates the
// student's real notes, so we shape believable output from the subthemes/titles
// that are actually passed in — the demo feels personalized and runs offline.
// ---------------------------------------------------------------------------

function subjectSeed(subject = {}) {
  const name = String(subject.name || subject.subject || 'seus estudos').slice(0, 80);
  const notes = Array.isArray(subject.notes) ? subject.notes : [];
  const topics = [...new Set(notes.map((n) => n.subtheme || n.subcategory || (Array.isArray(n.topicPath) ? n.topicPath[0] : '') || '').filter(Boolean))];
  const titles = notes.map((n) => String(n.title || '').trim()).filter(Boolean);
  const fallbackTopics = ['Fundamentos', 'Aplicações', 'Revisão geral'];
  return { name, notes, topics: topics.length ? topics : fallbackTopics, titles };
}

function pick(list, index, fallback) {
  return list.length ? list[index % list.length] : fallback;
}

export function getSubjectDemo({ action = 'questions', subject = {} } = {}) {
  const { name, topics, titles } = subjectSeed(subject);

  if (action === 'questions') {
    const difficulties = ['fácil', 'média', 'difícil'];
    const questions = topics.slice(0, 8).map((topic, i) => ({
      question: `Sobre ${topic} em ${name}: ${titles.length ? `o que "${pick(titles, i, topic)}" ajuda a entender?` : `qual é a ideia central deste tema?`}`,
      answer: `Retome o conceito de ${topic.toLowerCase()} conectando-o ao restante de ${name}. Explique com suas palavras e dê um exemplo próprio.`,
      topic,
      difficulty: difficulties[i % difficulties.length],
    }));
    return { subject: name, questions };
  }

  if (action === 'exam') {
    const questions = topics.slice(0, 8).map((topic, i) => ({
      question: `Qual afirmação descreve melhor "${topic}" dentro de ${name}?`,
      options: [
        `${topic} é um conceito central e se conecta aos demais subtemas.`,
        `${topic} não tem relação com ${name}.`,
        `${topic} só aparece em contextos avançados e isolados.`,
        `${topic} substitui todos os outros temas da matéria.`,
      ],
      answerIndex: 0,
      explanation: `Em ${name}, ${topic.toLowerCase()} funciona como um pilar que dá sentido aos outros subtemas — por isso a primeira alternativa está correta.`,
      topic,
    }));
    return { subject: name, durationMinutes: 10, questions };
  }

  if (action === 'plan') {
    const sessions = topics.slice(0, 5).map((topic, i) => ({
      label: `Dia ${i + 1}`,
      focus: topic,
      durationMinutes: 30,
      tasks: [`Reler as notas de ${topic}`, `Refazer o quiz de ${topic}`, i === 0 ? 'Mapear dúvidas em uma folha' : `Relacionar ${topic} com ${pick(topics, i - 1, 'outro tema')}`],
    }));
    const spacedReview = topics.slice(0, 4).map((topic, i) => ({ topic, when: ['em 1 dia', 'em 3 dias', 'em 1 semana', 'em 2 semanas'][i % 4] }));
    return { subject: name, overview: `Plano curto para consolidar ${name}: revise um subtema por dia e reforce com revisão espaçada.`, sessions, spacedReview };
  }

  if (action === 'podcast-script') {
    const format = subject.format === 'single' ? 'single' : 'dialogue';
    if (format === 'single') {
      const segments = [
        { speaker: 'narrator', text: `Bem-vindo ao episódio sobre ${name}. Hoje vamos revisar os principais pontos do que você estudou.` },
        ...topics.slice(0, 6).map((topic) => ({ speaker: 'narrator', text: `Vamos falar de ${topic}. A ideia é entender como esse tema se encaixa no todo de ${name} e por que ele importa.` })),
        { speaker: 'narrator', text: `Para fechar: retome uma nota por dia e teste o que aprendeu com um quiz. Até o próximo episódio de ${name}.` },
      ];
      return { subject: name, format: 'single', title: `Revisão guiada · ${name}`, segments };
    }
    const segments = [
      { speaker: 'A', text: `Oi! Hoje o tema é ${name}. Confesso que fiquei curiosa: por onde a gente começa?` },
      { speaker: 'B', text: `Ótima pergunta. A melhor porta de entrada costuma ser ${pick(topics, 0, 'os fundamentos')}, porque ele sustenta o resto da matéria.` },
    ];
    topics.slice(1, 6).forEach((topic, i) => {
      segments.push({ speaker: 'A', text: `E ${topic}? Como isso se conecta com o que a gente acabou de ver?` });
      segments.push({ speaker: 'B', text: `${topic} amplia a ideia anterior. Pense assim: quando você domina isso, ${name} fica bem mais fácil de enxergar como um todo.` });
    });
    segments.push({ speaker: 'A', text: `Resumindo pra quem está estudando ${name}?` });
    segments.push({ speaker: 'B', text: `Revise um subtema por vez, faça um quiz depois de cada um e volte nos pontos difíceis em alguns dias. Constância vence intensidade.` });
    return { subject: name, format: 'dialogue', title: `Conversa sobre ${name}`, segments };
  }

  // lesson-script
  const slides = [
    { heading: `Visão geral de ${name}`, bullets: topics.slice(0, 3), narration: `Nesta aula vamos percorrer ${name}, do essencial ao mais avançado, conectando os temas que você já estudou.` },
    ...topics.slice(0, 5).map((topic) => ({
      heading: topic,
      bullets: [`O que é ${topic}`, `Por que importa em ${name}`, 'Exemplo prático'],
      narration: `Vamos entender ${topic}. Observe como ele se relaciona com os outros temas de ${name} e fixe a ideia com um exemplo seu.`,
    })),
    { heading: 'Próximos passos', bullets: ['Refazer o quiz', 'Revisar em 3 dias', 'Anotar dúvidas'], narration: `Para consolidar ${name}, refaça o quiz, revise em alguns dias e registre o que ainda gera dúvida.` },
  ];
  return { subject: name, title: `Aula personalizada · ${name}`, soraPrompt: `cinematic abstract flowing shapes representing learning and ${name}, soft light, no text`, slides };
}
