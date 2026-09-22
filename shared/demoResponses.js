import { daysUntilEvent } from './studyCalendar.js';

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

function preferenceSeed(preferences = {}) {
  const goal = {
    vestibular: { label: 'vestibular', questionHint: 'com raciocínio de prova e comparação entre ideias', task: 'Resolver duas questões estilo vestibular' },
    enem: { label: 'ENEM', questionHint: 'com contexto e interpretação interdisciplinar', task: 'Resolver uma questão contextualizada no estilo ENEM' },
    school_exam: { label: 'prova da escola', questionHint: 'com cobrança direta do conteúdo da avaliação', task: 'Revisar definições e causas que podem cair na prova' },
    general: { label: 'revisão geral', questionHint: 'para consolidar fundamentos', task: 'Explicar o tema em voz alta com suas palavras' },
  }[preferences.studyGoal];
  const studyContext = {
    classes: { label: 'acompanhar aulas', planHint: 'ligando o conteúdo atual aos fundamentos e próximas revisões' },
    exam_season: { label: 'período de provas', planHint: 'priorizando revisão ativa, pontos fracos e simulados objetivos' },
    catch_up: { label: 'recuperar atrasos', planHint: 'reconstruindo fundamentos antes de aumentar a dificuldade' },
    maintenance: { label: 'manter revisão', planHint: 'preservando memória com retomadas curtas e prática distribuída' },
  }[preferences.studyContext];
  const pace = {
    light: { label: 'ritmo leve', minutes: 20, task: 'Fechar com uma revisão oral de 2 minutos' },
    regular: { label: 'ritmo regular', minutes: 30, task: 'Registrar uma dúvida e um acerto do dia' },
    intense: { label: 'ritmo intensivo', minutes: 45, task: 'Fazer uma rodada extra de questões cronometradas' },
  }[preferences.weeklyPace];
  const practice = {
    concept_first: { label: 'entender primeiro', task: 'Explicar o conceito antes de resolver' },
    questions_first: { label: 'questões primeiro', task: 'Resolver primeiro e depois corrigir os erros' },
    mixed: { label: 'explicação e prática', task: 'Alternar uma explicação curta com uma questão' },
  }[preferences.practiceMode];
  const review = {
    spaced: { label: 'revisão espaçada', task: 'Agendar uma retomada curta antes de esquecer' },
    retrieval: { label: 'teste ativo', task: 'Tentar lembrar sem consultar a resposta' },
    interleaved: { label: 'mistura de temas', task: 'Comparar este subtema com outro já estudado' },
    flashcards: { label: 'flashcards', task: 'Criar três cartões de pergunta e resposta' },
  }[preferences.reviewMethod];
  const calendarEvent = Array.isArray(preferences.studyCalendar?.events) ? preferences.studyCalendar.events[0] || null : null;
  return {
    goal: goal || { label: 'vestibular', questionHint: 'com raciocínio de prova e comparação entre ideias', task: 'Resolver duas questões estilo vestibular' },
    studyContext: studyContext || { label: 'acompanhar aulas', planHint: 'ligando o conteúdo atual aos fundamentos e próximas revisões' },
    pace: pace || { label: 'ritmo regular', minutes: 30, task: 'Registrar uma dúvida e um acerto do dia' },
    practice: practice || { label: 'explicação e prática', task: 'Alternar uma explicação curta com uma questão' },
    review: review || { label: 'revisão espaçada', task: 'Agendar uma retomada curta antes de esquecer' },
    calendarEvent,
  };
}

export function getSubjectDemo({ action = 'questions', subject = {}, preferences = {} } = {}) {
  const { name, topics, titles } = subjectSeed(subject);
  const { goal, studyContext, pace, practice, review, calendarEvent } = preferenceSeed(preferences);

  if (action === 'questions') {
    const difficulties = ['fácil', 'média', 'difícil'];
    const questions = topics.slice(0, 8).map((topic, i) => ({
      question: `Pensando em ${goal.label}, sobre ${topic} em ${name}: ${titles.length ? `o que "${pick(titles, i, topic)}" ajuda a entender?` : `qual é a ideia central deste tema?`}`,
      answer: `Retome o conceito de ${topic.toLowerCase()} conectando-o ao restante de ${name}, ${goal.questionHint}. Use ${practice.label} e feche com ${review.label}.`,
      topic,
      difficulty: difficulties[i % difficulties.length],
    }));
    return { subject: name, questions };
  }

  if (action === 'exam') {
    const questions = topics.slice(0, 8).map((topic) => ({
      question: `Em um simulado com foco em ${goal.label}, qual afirmação descreve melhor "${topic}" dentro de ${name}?`,
      options: [
        `${topic} é um conceito central e se conecta aos demais subtemas.`,
        `${topic} não tem relação com ${name}.`,
        `${topic} só aparece em contextos avançados e isolados.`,
        `${topic} substitui todos os outros temas da matéria.`,
      ],
      answerIndex: 0,
      explanation: `Em ${name}, ${topic.toLowerCase()} funciona como um pilar que dá sentido aos outros subtemas. Para ${goal.label}, vale corrigir por ${review.label}.`,
      topic,
    }));
    return { subject: name, durationMinutes: 10, questions };
  }

  if (action === 'plan') {
    const examDays = calendarEvent ? daysUntilEvent(calendarEvent, new Date('2026-09-21T12:00:00-03:00')) : null;
    const examTopics = calendarEvent?.topics?.length ? calendarEvent.topics : topics.slice(0, 3);
    const sessions = topics.slice(0, 5).map((topic, i) => ({
      label: `Dia ${i + 1}`,
      focus: examTopics.includes(topic) ? `${topic} · prioridade da prova` : topic,
      durationMinutes: calendarEvent && i < 3 ? Math.max(pace.minutes, 35) : pace.minutes,
      tasks: [
        calendarEvent && i === 0 ? `Abrir no Outlook o evento "${calendarEvent.title}" e confirmar os tópicos` : `Reler as notas de ${topic}`,
        practice.task,
        goal.task,
        review.task,
        calendarEvent && i < 3 ? `Resolver uma questão focada em ${pick(examTopics, i, topic)}` : i === 0 ? pace.task : `Relacionar ${topic} com ${pick(topics, i - 1, 'outro tema')}`,
      ],
    }));
    const spacedReview = topics.slice(0, 4).map((topic, i) => ({ topic, when: ['em 1 dia', 'em 3 dias', 'em 1 semana', 'em 2 semanas'][i % 4] }));
    const calendarBlock = calendarEvent ? {
      title: calendarEvent.title,
      startsAt: calendarEvent.startsAt,
      source: calendarEvent.source || 'Outlook',
      topics: examTopics,
      strategy: `Como a prova está em ${examDays} dias, o plano puxa ${examTopics.slice(0, 3).join(', ')} para as primeiras sessões.`,
    } : null;
    const overview = calendarEvent
      ? `Plano ajustado pelo Outlook: ${calendarEvent.title} está em ${examDays} dias, então a revisão de ${name} começa pelos tópicos mais prováveis da prova.`
      : `Plano para consolidar ${name} com foco em ${goal.label}, ${studyContext.label} e ${pace.label}: ${studyContext.planHint}.`;
    return { subject: name, overview, ...(calendarBlock ? { calendarEvent: calendarBlock } : {}), sessions, spacedReview };
  }

  if (action === 'podcast-script') {
    const format = ['dialogue', 'single', 'drive'].includes(subject.format) ? subject.format : 'dialogue';
    if (format === 'drive') {
      const reviewTopics = topics.slice(0, 3);
      const interactions = reviewTopics.map((topic, index) => ({
        id: `drive-${index + 1}`,
        topic,
        prompt: `Como ${topic} se conecta com ${name}?`,
        options: [
          { id: 'a', text: `${topic} ajuda a explicar uma parte central de ${name}.`, correct: true },
          { id: 'b', text: `${topic} não tem relação com o restante da matéria.`, correct: false },
        ],
        feedbackCorrect: `Certo. ${topic} deve ser ligado ao mapa geral da matéria, não decorado isoladamente.`,
        feedbackWrong: `Revise ${topic}: ele precisa aparecer conectado aos outros subtemas de ${name}.`,
      }));
      const segments = [
        { speaker: 'coach', text: `Vamos nessa. Eu vou revisar ${name} com você, fazendo perguntas rápidas. Responda em voz alta antes de continuar.` },
        { speaker: 'coach', text: `Primeiro, o mapa: suas notas passam por ${reviewTopics.join(', ')}. Como seu foco é ${goal.label}, tente responder com exemplos úteis para ${review.label}.` },
        ...interactions.flatMap((item, index) => [
          { speaker: 'coach', text: `Pergunta ${index + 1}: ${item.prompt} Responda em uma frase.` },
          { speaker: 'feedback', text: item.feedbackCorrect },
        ]),
        { speaker: 'coach', text: `Resumo final: se alguma resposta ficou insegura, volte ao tema no plano. Se saiu bem, faça um quiz curto quando parar o carro.` },
      ];
      return { subject: name, format: 'drive', title: `No carro · treino com IA · ${name}`, durationMinutes: 12, takeaways: reviewTopics, segments, interactions };
    }
    if (format === 'single') {
      const segments = [
        { speaker: 'narrator', text: `Bem-vindo. Hoje a revisão é sobre ${name}, sem pressa e sem enrolação.` },
        ...topics.slice(0, 6).map((topic) => ({ speaker: 'narrator', text: `Vamos para ${topic}. O ponto principal é entender onde isso entra no todo, não decorar uma frase solta.` })),
        { speaker: 'narrator', text: `Para fechar: retome uma nota por dia, no seu ${pace.label}, e teste o que aprendeu com um quiz alinhado ao seu foco em ${goal.label}. Pequeno, mas constante.` },
      ];
      return { subject: name, format: 'single', title: `Revisão guiada · ${name}`, durationMinutes: 8, takeaways: topics.slice(0, 4), segments };
    }
    const segments = [
      { speaker: 'A', text: `Hoje é ${name}, com foco em ${goal.label}. Me dá a porta de entrada: por onde eu começo sem me perder?` },
      { speaker: 'B', text: `Começa por ${pick(topics, 0, 'os fundamentos')}. É o tipo de ideia que ajuda o resto a fazer sentido e aparece bem em revisão.` },
    ];
    topics.slice(1, 6).forEach((topic) => {
      segments.push({ speaker: 'A', text: `E ${topic}? Isso entra como detalhe ou muda o quadro inteiro?` });
      segments.push({ speaker: 'B', text: `Muda o quadro. ${topic} ajuda a explicar uma consequência prática, daquelas que aparecem na prova e na vida real.` });
    });
    segments.push({ speaker: 'A', text: `Resumindo pra quem está estudando ${name}?` });
    segments.push({ speaker: 'B', text: `Um subtema por vez. Depois, um quiz curto e ${review.label}. O segredo aqui não é estudar muito de uma vez; é voltar antes de esquecer.` });
    return { subject: name, format: 'dialogue', title: `Conversa sobre ${name}`, durationMinutes: 10, takeaways: topics.slice(0, 4), segments };
  }

  // lesson-script
  const slides = [
    { heading: `Visão geral de ${name}`, bullets: topics.slice(0, 3), narration: `Nesta aula vamos percorrer ${name}, do essencial ao mais avançado, com foco em ${goal.label} e ${practice.label}.` },
    ...topics.slice(0, 5).map((topic) => ({
      heading: topic,
      bullets: [`O que é ${topic}`, `Por que importa em ${name}`, 'Exemplo prático'],
      narration: `Vamos entender ${topic}. Observe como ele se relaciona com os outros temas de ${name} e fixe a ideia com um exemplo seu.`,
    })),
    { heading: 'Próximos passos', bullets: ['Refazer o quiz', review.task, 'Anotar dúvidas'], narration: `Para consolidar ${name}, refaça o quiz, use ${review.label} e registre o que ainda gera dúvida.` },
  ];
  return { subject: name, title: `Aula personalizada · ${name}`, slides };
}
