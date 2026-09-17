const SAVED_AT = '2026-09-17T18:30:00.000Z';
const LEGACY_DEMO_SAVED_AT = new Set(['2026-09-17T12:00:00.000Z']);

const historyQuestions = {
  subject: 'História',
  provider: 'demo',
  model: 'seeded-demo',
  mode: 'demo',
  questions: [
    {
      question: 'Por que a fábrica mudou a forma de produzir no século 19?',
      answer: 'Porque reuniu trabalhadores, máquinas e matéria-prima no mesmo espaço, dividindo o trabalho em etapas repetidas. Isso aumentou a escala de produção, mas reduziu a autonomia do trabalhador artesanal.',
      topic: 'Indústria e fábricas',
      difficulty: 'média',
    },
    {
      question: 'O que a concentração de operários nas cidades favoreceu politicamente?',
      answer: 'Favoreceu a organização coletiva, como sindicatos e movimentos por direitos trabalhistas, porque muitos trabalhadores passaram a compartilhar jornadas, riscos e reivindicações semelhantes.',
      topic: 'Trabalhadores e movimento operário',
      difficulty: 'média',
    },
    {
      question: 'Qual foi o papel da locomotiva a vapor na Revolução Industrial?',
      answer: 'Ela reduziu tempo e custo de transporte de carvão, matéria-prima e produtos, conectando minas, fábricas e mercados com muito mais velocidade.',
      topic: 'Transporte e máquinas a vapor',
      difficulty: 'fácil',
    },
    {
      question: 'Por que a especialização do trabalho aumentava produtividade e criava tensão social ao mesmo tempo?',
      answer: 'Ela tornava a produção mais rápida, mas também repetitiva e controlada por ritmos externos ao trabalhador. Isso gerava perda de autonomia, jornadas longas e conflitos por melhores condições.',
      topic: 'Indústria e fábricas',
      difficulty: 'difícil',
    },
    {
      question: 'Como a Spinning Jenny ajuda a explicar a mecanização têxtil?',
      answer: 'Ela multiplicava a quantidade de fusos operados por uma pessoa, aumentando a produção de fios. Isso mostra como uma inovação técnica podia acelerar a indústria têxtil e pressionar oficinas tradicionais.',
      topic: 'Mecanização têxtil',
      difficulty: 'média',
    },
    {
      question: 'Por que o trabalho infantil virou um tema central nas críticas à industrialização?',
      answer: 'Porque crianças eram expostas a jornadas longas, baixos salários e riscos físicos dentro das fábricas. As denúncias ajudaram a pressionar por leis fabris e limites à exploração.',
      topic: 'Trabalho infantil e leis fabris',
      difficulty: 'média',
    },
    {
      question: 'O que o Crystal Palace revelava sobre a sociedade industrial vitoriana?',
      answer: 'Ele transformava máquinas, mercadorias e materiais industriais em espetáculo público, apresentando a indústria como sinal de progresso, poder econômico e competição global.',
      topic: 'Exposições industriais e consumo',
      difficulty: 'difícil',
    },
  ],
};

const examQuestions = [
  {
    question: 'A principal mudança produtiva trazida pela fábrica foi:',
    options: ['Retorno ao artesanato doméstico', 'Produção concentrada e divisão do trabalho', 'Fim das máquinas a vapor', 'Substituição das cidades pelo campo'],
    answerIndex: 1,
    explanation: 'A fábrica concentrou trabalhadores e máquinas, separando o processo em etapas repetidas e controladas.',
    topic: 'Indústria e fábricas',
  },
  {
    question: 'A concentração de operários em grandes unidades industriais contribuiu para:',
    options: ['Isolamento completo dos trabalhadores', 'Enfraquecimento de qualquer reivindicação', 'Organização sindical e lutas por direitos', 'Fim das jornadas fixas'],
    answerIndex: 2,
    explanation: 'Compartilhar problemas parecidos no mesmo espaço facilitou mobilização, greves e sindicatos.',
    topic: 'Trabalhadores e movimento operário',
  },
  {
    question: 'As ferrovias a vapor foram importantes porque:',
    options: ['Transportavam apenas passageiros de luxo', 'Reduziram a circulação de carvão', 'Aumentaram custo e tempo de transporte', 'Ligaram minas, fábricas e mercados com rapidez'],
    answerIndex: 3,
    explanation: 'Ferrovias integraram regiões produtivas e aceleraram a circulação de insumos e mercadorias.',
    topic: 'Transporte e máquinas a vapor',
  },
  {
    question: 'No contexto industrial, especialização significa:',
    options: ['Cada trabalhador dominar o produto inteiro', 'Cada pessoa repetir uma etapa específica do processo', 'Produzir sem divisão de tarefas', 'Eliminar supervisão e horários'],
    answerIndex: 1,
    explanation: 'A especialização aumenta velocidade ao dividir o processo em tarefas menores e repetidas.',
    topic: 'Indústria e fábricas',
  },
  {
    question: 'A Spinning Jenny é um bom exemplo de:',
    options: ['Mecanização da produção têxtil', 'Retorno ao feudalismo', 'Proibição do trabalho feminino', 'Transporte marítimo a vapor'],
    answerIndex: 0,
    explanation: 'A máquina ampliava a capacidade de fiar, mostrando como o setor têxtil foi mecanizado.',
    topic: 'Mecanização têxtil',
  },
  {
    question: 'O Crystal Palace e a Grande Exposição de 1851 ajudam a entender:',
    options: ['A indústria como vitrine de progresso e poder econômico', 'O fim da produção industrial inglesa', 'A rejeição completa às máquinas', 'A volta da economia rural isolada'],
    answerIndex: 0,
    explanation: 'A exposição apresentou máquinas e produtos industriais como símbolo de modernidade e competição internacional.',
    topic: 'Exposições industriais e consumo',
  },
];

const examResult = {
  subject: 'História',
  score: 5,
  total: 6,
  percent: 83,
  byTopic: {
    'Indústria e fábricas': { correct: 2, total: 2 },
    'Trabalhadores e movimento operário': { correct: 0, total: 1 },
    'Transporte e máquinas a vapor': { correct: 1, total: 1 },
    'Mecanização têxtil': { correct: 1, total: 1 },
    'Exposições industriais e consumo': { correct: 1, total: 1 },
  },
  answers: { 0: 1, 1: 1, 2: 3, 3: 1, 4: 0, 5: 0 },
  questions: examQuestions,
  takenAt: SAVED_AT,
};

const podcastDialogue = {
  subject: 'História',
  provider: 'demo',
  model: 'seeded-demo',
  mode: 'demo',
  format: 'dialogue',
  title: 'História no caminho: máquinas, fábricas e gente',
  durationMinutes: 10,
  takeaways: ['Máquinas aceleram a produção', 'Fábricas concentram trabalho e conflito', 'A indústria vira espetáculo e mercado'],
  segments: [
    { speaker: 'A', text: 'Tá, revisão-relâmpago de História. Se eu lembrar só uma ideia da Revolução Industrial, qual é?' },
    { speaker: 'B', text: 'Lembra desta: a máquina muda o ritmo da vida. A Spinning Jenny acelera o fio; a fábrica junta gente, energia e matéria-prima no mesmo lugar.' },
    { speaker: 'A', text: 'Então não é só invenção bonita em museu. É uma mudança no trabalho de todo dia.' },
    { speaker: 'B', text: 'Exato. A produção cresce, mas a rotina fica mais rígida: turno, supervisão, repetição e pouca autonomia.' },
    { speaker: 'A', text: 'E aí aparecem os conflitos: operários, crianças trabalhando, pedidos por jornada menor.' },
    { speaker: 'B', text: 'Isso. A concentração de trabalhadores ajuda sindicatos e leis fabris a entrarem no debate público.' },
    { speaker: 'A', text: 'Fechando: trem e Crystal Palace entram onde nessa história?' },
    { speaker: 'B', text: 'O trem liga minas, fábricas e mercados. O Crystal Palace mostra a indústria como espetáculo de progresso. Resumo: tecnologia acelera a produção, trabalho vira disputa social e mercado ganha escala global.' },
  ],
};

const podcastSingle = {
  subject: 'História',
  provider: 'demo',
  model: 'seeded-demo',
  mode: 'demo',
  format: 'single',
  title: 'Revisão guiada: Revolução Industrial sem pressa',
  durationMinutes: 10,
  takeaways: ['A mecanização muda escala', 'A fábrica reorganiza tempo e trabalho', 'A crítica social leva a reformas'],
  segments: [
    { speaker: 'narrator', text: 'Vamos revisar História com calma. A Revolução Industrial não é só uma lista de invenções; é uma mudança no modo de viver, trabalhar e consumir.' },
    { speaker: 'narrator', text: 'Comece pela mecanização têxtil. A Spinning Jenny aumenta a produção de fios e mostra como uma máquina simples podia mexer com todo um setor.' },
    { speaker: 'narrator', text: 'Depois vem a fábrica. Ela concentra trabalhadores, máquinas e matéria-prima. O ganho é produtividade; o custo é uma rotina mais rígida e repetitiva.' },
    { speaker: 'narrator', text: 'A cidade industrial junta muita gente com problemas parecidos. Por isso, sindicatos, greves e reivindicações ganham força nesse contexto.' },
    { speaker: 'narrator', text: 'O trabalho infantil mostra o lado social mais duro da industrialização. A crítica pública pressiona por leis fabris e limites de jornada.' },
    { speaker: 'narrator', text: 'Para fechar, ferrovias e Crystal Palace ampliam a escala. O trem conecta mercados; a exposição transforma a indústria em vitrine de progresso.' },
  ],
};

const podcastDrive = {
  subject: 'História',
  provider: 'demo',
  model: 'seeded-demo',
  mode: 'demo',
  format: 'drive',
  title: 'No carro: História em rota de revisão',
  durationMinutes: 10,
  takeaways: ['Tecnologia, trabalho e mercado andam juntos', 'O avanço técnico teve custo social', 'Ferrovias e exposições ampliam a indústria'],
  segments: [
    { speaker: 'narrator', text: 'Vamos revisar História sem precisar olhar para a tela. Pense na Revolução Industrial como uma sequência: máquina, fábrica, trabalhador, transporte e consumo.' },
    { speaker: 'narrator', text: 'Primeiro, máquina. A Spinning Jenny acelera a fiação e mostra que produtividade muda quando a técnica muda.' },
    { speaker: 'narrator', text: 'Segundo, fábrica. Ela reúne muita gente no mesmo espaço e transforma o tempo em turno, supervisão e repetição.' },
    { speaker: 'narrator', text: 'Terceiro, conflito social. Operários e crianças enfrentam jornadas longas; daí surgem greves, sindicatos e pressão por leis fabris.' },
    { speaker: 'narrator', text: 'Quarto, circulação. O trem a vapor leva carvão, matéria-prima e produtos com mais velocidade.' },
    { speaker: 'narrator', text: 'Resumo final: a Revolução Industrial acelera a produção, reorganiza o trabalho e transforma a indústria em símbolo de progresso e poder.' },
  ],
};

const podcasts = {
  subject: 'História',
  provider: 'demo',
  model: 'seeded-demo',
  mode: 'demo',
  formats: {
    dialogue: podcastDialogue,
    single: podcastSingle,
    drive: podcastDrive,
  },
};

const videoRecommendations = {
  query: 'Revolução Industrial aula Brasil Escola YouTube',
  focus: 'Selecionar vídeos reais de aula sobre Revolução Industrial, Primeira Revolução Industrial, Segunda Revolução Industrial e abordagem de Enem.',
  reason: 'usa vídeos reais encontrados no YouTube, com links diretos e critérios didáticos para a apresentação',
  mode: 'demo',
  provider: 'youtube-search-curated',
  model: 'manual-curation-2026-09-17',
  videos: [
    {
      id: 'yt-9Y1wYtNM90s',
      title: 'Revolução Industrial / Parte 1 - Brasil Escola',
      description: 'Videoaula real do Brasil Escola sobre a Revolução Industrial e o desenvolvimento tecnológico e industrial iniciado na Inglaterra a partir do século XVIII.',
      channelTitle: 'Brasil Escola',
      sourceLabel: 'YouTube',
      thumbnail: 'https://i.ytimg.com/vi/9Y1wYtNM90s/hqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=9Y1wYtNM90s',
      searchQuery: 'Revolução Industrial Parte 1 Brasil Escola',
      didacticReason: 'Boa abertura para apresentar a matéria porque situa o processo histórico e o avanço tecnológico antes de entrar nos subtemas.',
      watchFor: ['Inglaterra no século XVIII', 'Desenvolvimento tecnológico', 'Industrialização'],
      estimatedMinutes: 18,
      saved: true,
      feedback: 'up',
    },
    {
      id: 'yt-oD5_07uc9e8',
      title: 'Primeira Revolução Industrial - Brasil Escola',
      description: 'Videoaula real sobre o processo da Primeira Revolução Industrial e os elementos que favoreceram essa transformação produtiva.',
      channelTitle: 'Brasil Escola',
      sourceLabel: 'YouTube',
      thumbnail: 'https://i.ytimg.com/vi/oD5_07uc9e8/hqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=oD5_07uc9e8',
      searchQuery: 'Primeira Revolução Industrial Brasil Escola',
      didacticReason: 'Funciona bem para explicar mecanização, fábrica e pioneirismo inglês com uma linguagem escolar direta.',
      watchFor: ['Primeira Revolução Industrial', 'Pioneirismo inglês', 'Mecanização'],
      estimatedMinutes: 12,
      saved: true,
      feedback: 'up',
    },
    {
      id: 'yt-j8PRPqXPOAs',
      title: 'Revolução Industrial no Enem - Brasil Escola',
      description: 'Videoaula real focada em como o Enem costuma cobrar Revolução Industrial, incluindo pioneirismo inglês, efeitos sociais e leitura de contexto.',
      channelTitle: 'Brasil Escola',
      sourceLabel: 'YouTube',
      thumbnail: 'https://i.ytimg.com/vi/j8PRPqXPOAs/hqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=j8PRPqXPOAs',
      searchQuery: 'Revolução Industrial no Enem Brasil Escola',
      didacticReason: 'Boa para conectar o simulado do app com prova, interpretação e pontos fracos de revisão.',
      watchFor: ['Pioneirismo inglês', 'Efeitos sociais', 'Cobrança no Enem'],
      estimatedMinutes: 15,
      saved: true,
      feedback: 'up',
    },
    {
      id: 'yt-zeBFhBGbmxc',
      title: 'Segunda Revolução Industrial - Brasil Escola',
      description: 'Videoaula real sobre a Segunda Revolução Industrial, útil para comparar a etapa inicial do vapor e carvão com a expansão posterior da indústria.',
      channelTitle: 'Brasil Escola',
      sourceLabel: 'YouTube',
      thumbnail: 'https://i.ytimg.com/vi/zeBFhBGbmxc/hqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=zeBFhBGbmxc',
      searchQuery: 'Segunda Revolução Industrial Brasil Escola',
      didacticReason: 'Ajuda a ampliar a apresentação para além da primeira fase e mostrar continuidade tecnológica.',
      watchFor: ['Segunda Revolução Industrial', 'Expansão industrial', 'Comparação com primeira fase'],
      estimatedMinutes: 13,
      saved: false,
      feedback: null,
    },
    {
      id: 'yt-FzDzV2v2pwQ',
      title: 'Revolução Industrial - Brasil Escola',
      description: 'Videoaula real de síntese sobre Revolução Industrial, indicada como reforço rápido para rever conceito, causas e consequências.',
      channelTitle: 'Brasil Escola',
      sourceLabel: 'YouTube',
      thumbnail: 'https://i.ytimg.com/vi/FzDzV2v2pwQ/hqdefault.jpg',
      url: 'https://www.youtube.com/watch?v=FzDzV2v2pwQ',
      searchQuery: 'Revolução Industrial Brasil Escola',
      didacticReason: 'Serve como vídeo de revisão geral antes de o aluno passar para o podcast ou refazer o simulado.',
      watchFor: ['Conceito geral', 'Causas', 'Consequências'],
      estimatedMinutes: 12,
      saved: false,
      feedback: null,
    },
  ],
};

const lesson = {
  subject: 'História',
  provider: 'demo',
  model: 'seeded-demo',
  mode: 'demo',
  title: 'Revolução Industrial em 8 slides',
  slides: [
    {
      heading: 'A grande virada produtiva',
      bullets: ['Produção sai do ritmo artesanal', 'Fábricas concentram trabalho e máquinas', 'Carvão e vapor ampliam escala'],
      narration: 'A Revolução Industrial muda o centro da produção. Em vez de uma oficina isolada, a fábrica reúne pessoas, máquinas e matéria-prima em um mesmo espaço.',
    },
    {
      heading: 'Mecanização têxtil',
      bullets: ['Spinning Jenny multiplica fusos', 'Mais fio em menos tempo', 'Oficinas tradicionais sofrem pressão'],
      narration: 'A Spinning Jenny é uma imagem simples para uma ideia grande: quando uma máquina faz mais rápido o que antes era manual, todo o setor produtivo precisa se reorganizar.',
    },
    {
      heading: 'Fábrica e divisão do trabalho',
      bullets: ['Tarefas menores e repetidas', 'Mais produtividade', 'Menos autonomia do trabalhador'],
      narration: 'A divisão do trabalho acelera a produção porque cada pessoa repete uma etapa específica. O ganho de escala vem junto de uma rotina mais controlada.',
    },
    {
      heading: 'Operários e cidade industrial',
      bullets: ['Jornadas fixas', 'Riscos e baixos salários', 'Organização coletiva'],
      narration: 'Quando muitos trabalhadores vivem problemas parecidos, fica mais fácil organizar reivindicações. É aí que sindicatos e greves ganham força.',
    },
    {
      heading: 'Trabalho infantil e crítica social',
      bullets: ['Crianças em jornadas longas', 'Acidentes e baixa proteção', 'Pressão por leis fabris'],
      narration: 'A industrialização também tem um lado duro: crianças e jovens trabalharam em ambientes perigosos. A crítica pública ajudou a transformar exploração em pauta política.',
    },
    {
      heading: 'Transporte a vapor',
      bullets: ['Ferrovias ligam regiões', 'Carvão chega às fábricas', 'Produtos alcançam mercados maiores'],
      narration: 'A locomotiva a vapor conecta minas, fábricas e cidades. Isso reduz custos e ajuda a indústria a crescer além do mercado local.',
    },
    {
      heading: 'Crystal Palace e consumo',
      bullets: ['Grande Exposição de 1851', 'Máquinas viram espetáculo', 'Indústria como poder global'],
      narration: 'O Crystal Palace mostra a indústria como vitrine: máquinas e mercadorias passam a representar progresso, competição e prestígio nacional.',
    },
    {
      heading: 'Síntese para apresentar',
      bullets: ['Máquina muda escala', 'Fábrica muda trabalho', 'Mercado muda circulação e consumo'],
      narration: 'Para fechar: tecnologia, trabalho e mercado andam juntos. Essa é a lógica central para explicar a Revolução Industrial com clareza.',
    },
  ],
};

const plan = {
  subject: 'História',
  provider: 'demo',
  model: 'seeded-demo',
  mode: 'demo',
  overview: 'Trilha pronta para apresentar: comece pela mecanização têxtil, passe pela fábrica e pelos trabalhadores, e feche com ferrovias, Crystal Palace e consumo industrial.',
  sessions: [
    {
      label: 'Sessão 1',
      focus: 'Mecanização têxtil e fábricas',
      durationMinutes: 20,
      tasks: ['Revisar a nota da Spinning Jenny', 'Explicar divisão do trabalho em voz alta', 'Anotar uma consequência técnica e uma social'],
    },
    {
      label: 'Sessão 2',
      focus: 'Trabalhadores e movimento operário',
      durationMinutes: 25,
      tasks: ['Rever o diagnóstico do simulado', 'Comparar jornada fixa e trabalho artesanal', 'Abrir a busca salva sobre movimento operário'],
    },
    {
      label: 'Sessão 3',
      focus: 'Transporte e máquinas a vapor',
      durationMinutes: 15,
      tasks: ['Assistir uma aula curta sobre ferrovias', 'Relacionar carvão, fábrica e mercado', 'Responder uma pergunta de síntese'],
    },
    {
      label: 'Sessão 4',
      focus: 'Exposições industriais e consumo',
      durationMinutes: 15,
      tasks: ['Rever a nota do Crystal Palace', 'Explicar por que indústria também vira espetáculo', 'Conectar tecnologia, império e mercado consumidor'],
    },
  ],
  spacedReview: [
    { topic: 'Trabalhadores e movimento operário', when: 'em 1 dia' },
    { topic: 'Mecanização têxtil', when: 'em 3 dias' },
    { topic: 'Transporte e máquinas a vapor', when: 'em 1 semana' },
    { topic: 'Exposições industriais e consumo', when: 'em 2 semanas' },
  ],
};

export const DEMO_SUBJECT_ARTIFACTS = {
  'História': {
    questions: { data: historyQuestions, savedAt: SAVED_AT },
    exam: { data: { subject: 'História', provider: 'demo', model: 'seeded-demo', mode: 'demo', durationMinutes: 10, questions: examQuestions }, savedAt: SAVED_AT },
    examResult: { data: examResult, savedAt: SAVED_AT },
    podcast: { data: podcastDialogue, savedAt: SAVED_AT },
    podcasts: { data: podcasts, savedAt: SAVED_AT },
    videoRecommendations: { data: videoRecommendations, savedAt: SAVED_AT },
    lesson: { data: lesson, savedAt: SAVED_AT },
    plan: { data: plan, savedAt: SAVED_AT },
    planProgress: { data: { '0-0': true, '0-1': true, '1-0': false }, savedAt: SAVED_AT },
  },
};

function isSeededDemoArtifact(artifact) {
  if (LEGACY_DEMO_SAVED_AT.has(artifact?.savedAt)) return true;
  const data = artifact?.data;
  if (!data || typeof data !== 'object') return false;
  return data.mode === 'demo' || data.provider === 'demo' || data.provider === 'seeded-demo' || data.model === 'seeded-demo';
}

export function mergeDemoSubjectArtifacts(stored = {}) {
  const next = { ...stored };
  let changed = false;

  Object.entries(DEMO_SUBJECT_ARTIFACTS).forEach(([subject, artifacts]) => {
    const current = next[subject] || {};
    const mergedSubject = { ...current };
    Object.entries(artifacts).forEach(([key, artifact]) => {
      if (!mergedSubject[key] || isSeededDemoArtifact(mergedSubject[key])) {
        mergedSubject[key] = artifact;
        changed = true;
      }
    });
    next[subject] = mergedSubject;
  });

  return { artifacts: next, changed };
}
