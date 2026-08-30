import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  deleteMediaRecord,
  getAllMediaRecords,
  getHistory,
  getNotes,
  getPlan,
  getSubjectArtifacts,
  getUser,
  saveMediaRecord,
  setHistory as persistHistory,
  setNotes as persistNotes,
  setPlan as persistPlan,
  setSubjectArtifacts as persistSubjectArtifacts,
  setUser as persistUser,
} from '../services/storage.js';
import { aggregateSubjects } from '../services/subjectStudy.js';

const AppDataContext = createContext(null);

const ASSET_BASE = '/demo-assets';

const studyAssets = {
  history: [`${ASSET_BASE}/history-factory.jpg`, `${ASSET_BASE}/history-workers.jpg`, `${ASSET_BASE}/history-railway.jpg`],
  programming: [`${ASSET_BASE}/programming-code.jpg`, `${ASSET_BASE}/programming-javascript.jpg`, `${ASSET_BASE}/programming-frontend.jpg`],
  books: [`${ASSET_BASE}/books-library.jpg`, `${ASSET_BASE}/books-open.jpg`, `${ASSET_BASE}/books-shelves.jpg`],
  photography: [`${ASSET_BASE}/camera-vintage.jpg`, `${ASSET_BASE}/camera-collection.jpg`, `${ASSET_BASE}/photography-film.jpg`],
};

const samples = [
  { id: 'sample-1', src: `${ASSET_BASE}/demo-default-photo.jpg`, createdAt: '2026-08-25T20:00:00.000Z', source: 'sample', label: 'Livro', aiAvailable: true },
  { id: 'sample-3', src: `${ASSET_BASE}/demo-resultado-encontrado.jpg`, createdAt: '2026-08-23T15:10:00.000Z', source: 'sample', label: 'Resultado', aiAvailable: false },
  { id: 'sample-4', src: `${ASSET_BASE}/demo-buscando-texto.jpg`, createdAt: '2026-08-22T11:45:00.000Z', source: 'sample', label: 'Pesquisa', aiAvailable: false },
];

// Fontes reais (Wikimedia Commons, domínio público/CC0) documentadas em public/demo-assets/SOURCES.md
const THEME_SOURCES = {
  historyFactory: { label: 'Apollokerzenfabrik innen (Historisches Museum der Stadt Wien)', url: 'https://commons.wikimedia.org/wiki/File:Apollokerzenfabrik_innen.jpg' },
  historyWorkers: { label: 'M&K Industrial Revolution, 1900', url: 'https://commons.wikimedia.org/wiki/File:MandK_Industrial_Revolution_1900.jpg' },
  historyRailway: { label: 'Locomotiva a vapor, 1814 (Library of Congress)', url: 'https://commons.wikimedia.org/wiki/File:Early_steam_locomotive_with_toothed_%22propelling_wheel%22_which_gripped_a_ribbed_rail_while_other_wheels_rode_on_a_smooth_rail,_and_two_coal_cars_LCCN2006691760.jpg' },
  programmingCode: { label: 'Python Code', url: 'https://commons.wikimedia.org/wiki/File:Python_Code.jpg' },
  programmingJavascript: { label: 'JavaScript code', url: 'https://commons.wikimedia.org/wiki/File:JavaScript_code.png' },
  programmingFrontend: { label: 'Morfik Visual Designer', url: 'https://commons.wikimedia.org/wiki/File:MorfikVisualDesigner.png' },
  booksLibrary: { label: 'Library bookshelf', url: 'https://commons.wikimedia.org/wiki/File:Library_bookshelf.jpg' },
  booksOpen: { label: 'Through the reading glasses (Unsplash)', url: 'https://commons.wikimedia.org/wiki/File:Through_the_reading_glasses_(Unsplash).jpg' },
  cameraVintage: { label: 'Vintage camera', url: 'https://commons.wikimedia.org/wiki/File:Vintage_camera.jpg' },
  cameraCollection: { label: 'Collection of old cameras', url: 'https://commons.wikimedia.org/wiki/File:Collection_of_old_cameras.jpg' },
  photographyFilm: { label: '300 35mm film frame', url: 'https://commons.wikimedia.org/wiki/File:300_35mm_film_frame.jpg' },
};

const sampleNotes = [
  {
    id: 'sample-note-1',
    seed: true,
    recordId: 'sample-3',
    image: studyAssets.history[0],
    images: [studyAssets.history[0]],
    title: 'Como uma fábrica do século 19 organizava a produção',
    summary: 'A gravura de uma fábrica de velas em Viena mostra como o trabalho manual em série substituiu a produção artesanal isolada durante a Revolução Industrial.',
    keyPoints: [
      'A produção em série divide o trabalho em etapas repetidas por pessoas diferentes',
      'Fábricas reuniam dezenas de trabalhadores sob o mesmo teto, algo raro antes do século 19',
      'A especialização em uma etapa aumentava a velocidade, mas reduzia a autonomia do trabalhador',
    ],
    text: 'Na imagem, tonéis e bancadas alinhados mostram várias pessoas realizando a mesma etapa da produção ao mesmo tempo — a lógica da linha de montagem antes mesmo da eletricidade. Essa organização em série permitiu multiplicar a produção sem depender de um único artesão dominando o processo inteiro do início ao fim.',
    category: 'História',
    subcategory: 'Indústria e fábricas',
    topicPath: ['Indústria e fábricas'],
    sources: [THEME_SOURCES.historyFactory],
    favorite: false,
    createdAt: '2026-08-25T19:20:00.000Z',
  },
  {
    id: 'sample-note-2',
    seed: true,
    recordId: 'sample-4',
    image: studyAssets.history[1],
    images: [studyAssets.history[1]],
    title: 'A multidão que saía das fábricas no início do século 20',
    summary: 'Uma fotografia de operários deixando o trabalho em massa registra o novo tipo de rotina urbana criado pela industrialização.',
    keyPoints: [
      'A rotina de turnos fixos surgiu com a fábrica, não existia na produção artesanal',
      'Concentrar muitos trabalhadores no mesmo local facilitou a organização coletiva',
      'Os primeiros sindicatos nasceram de demandas como jornada de trabalho e segurança',
    ],
    text: 'A foto mostra dezenas de trabalhadores caminhando juntos por uma rua estreita entre prédios industriais — uma cena que só existe porque a fábrica concentrou muita gente no mesmo lugar e no mesmo turno. Foi justamente essa concentração que tornou possível a organização dos primeiros sindicatos: ficou mais fácil combinar reivindicações quando centenas de pessoas compartilhavam a mesma jornada e os mesmos problemas.',
    category: 'História',
    subcategory: 'Trabalhadores e movimento operário',
    topicPath: ['Trabalhadores e movimento operário'],
    sources: [THEME_SOURCES.historyWorkers],
    favorite: false,
    createdAt: '2026-08-25T11:05:00.000Z',
  },
  {
    id: 'sample-note-3',
    seed: true,
    recordId: 'sample-1',
    image: studyAssets.history[2],
    images: [studyAssets.history[2]],
    title: 'A engenharia das primeiras locomotivas a vapor',
    summary: 'As primeiras locomotivas a vapor do início do século XIX usavam soluções de engenharia bem diferentes das ferrovias modernas.',
    keyPoints: [
      'A tração por engrenagem em trilho estriado foi uma das primeiras soluções testadas antes da adesão simples por atrito virar padrão',
      'O transporte de carvão foi um dos primeiros usos práticos da locomotiva a vapor, ligando minas às fábricas',
      'A ferrovia a vapor reduziu o custo e o tempo de transporte de matérias-primas, acelerando a industrialização britânica',
    ],
    text: 'Esta gravura de 1814 mostra um modelo com uma roda dentada central que se engrenava a um trilho estriado para gerar tração, enquanto as demais rodas apenas se apoiavam sobre trilhos lisos — uma resposta à dúvida da época sobre se rodas comuns teriam atrito suficiente para puxar cargas pesadas. Máquinas assim, movendo vagões de carvão como os da imagem, foram decisivas para o transporte de matéria-prima nas primeiras fábricas da Revolução Industrial.',
    category: 'História',
    subcategory: 'Transporte e máquinas a vapor',
    topicPath: ['Transporte e máquinas a vapor'],
    sources: [THEME_SOURCES.historyRailway],
    favorite: true,
    createdAt: '2026-08-24T16:40:00.000Z',
  },
  {
    id: 'sample-note-4',
    seed: true,
    recordId: 'sample-3',
    image: studyAssets.programming[0],
    images: [studyAssets.programming[0]],
    title: 'Primeiros passos com Python',
    summary: 'Variáveis, listas e funções são blocos fundamentais para começar a programar em Python.',
    keyPoints: ['Variáveis guardam valores', 'Listas organizam coleções', 'Funções evitam repetição de código'],
    text: 'Na captura de tela, o código usa exatamente esses três elementos: uma variável guarda um valor, uma lista reúne vários valores e uma função organiza uma tarefa que pode ser reutilizada em diferentes partes do programa.',
    category: 'Programação',
    subcategory: 'Python',
    topicPath: ['Python'],
    sources: [THEME_SOURCES.programmingCode],
    favorite: true,
    createdAt: '2026-08-24T09:15:00.000Z',
  },
  {
    id: 'sample-note-5',
    seed: true,
    recordId: 'sample-4',
    image: studyAssets.programming[1],
    images: [studyAssets.programming[1]],
    title: 'Como o JavaScript deixa uma página interativa',
    summary: 'JavaScript é a linguagem que roda direto no navegador e permite que uma página reaja a cliques, formulários e outros eventos sem recarregar.',
    keyPoints: [
      'JavaScript roda no navegador e reage a eventos da página',
      'const e let declaram variáveis com escopo controlado',
      'Métodos como map e sort organizam dados sem repetir código',
    ],
    text: 'Como mostra o trecho de código na imagem, comandos como const, for e funções de callback controlam o fluxo do programa, enquanto APIs do navegador dão acesso a datas, elementos HTML e dados do usuário. É essa camada que transforma um HTML estático em uma interface interativa.',
    category: 'Programação',
    subcategory: 'JavaScript e desenvolvimento web',
    topicPath: ['JavaScript e desenvolvimento web'],
    sources: [THEME_SOURCES.programmingJavascript],
    favorite: false,
    createdAt: '2026-08-23T14:50:00.000Z',
  },
  {
    id: 'sample-note-6',
    seed: true,
    recordId: 'sample-1',
    image: studyAssets.programming[2],
    images: [studyAssets.programming[2]],
    title: 'O que define a camada de frontend de um site',
    summary: 'Frontend é a parte de um sistema que o usuário vê e toca: botões, formulários, cores e espaçamento definidos por HTML e CSS.',
    keyPoints: [
      'HTML estrutura o conteúdo e CSS define a aparência',
      'Estados como hover e disabled mudam o visual de um botão',
      'Ferramentas visuais aceleram a montagem de telas e formulários',
    ],
    text: 'A imagem mostra um editor visual antigo montando uma tela de login ao arrastar componentes prontos e ajustar estilos, como bordas, cores e estados de hover, sem escrever cada linha manualmente. O resultado final ainda depende de HTML e CSS por trás, mas o processo de construção pode ser guiado visualmente.',
    category: 'Programação',
    subcategory: 'Frontend e design de interface',
    topicPath: ['Frontend e design de interface'],
    sources: [THEME_SOURCES.programmingFrontend],
    favorite: false,
    createdAt: '2026-08-23T08:30:00.000Z',
  },
  {
    id: 'sample-note-7',
    seed: true,
    recordId: 'sample-3',
    image: studyAssets.books[0],
    images: [studyAssets.books[0]],
    title: 'Por que organizar referências em uma biblioteca ajuda a estudar',
    summary: 'Uma biblioteca com prateleiras identificadas por assunto mostra na prática como agrupar referências por tema facilita encontrar o que se precisa depois.',
    keyPoints: [
      'Agrupar por assunto no momento de salvar evita retrabalho de organização depois',
      'Sinalização clara, como uma placa de categoria, reduz o tempo de busca',
      'Uma biblioteca pessoal de referências fica mais útil quanto mais cedo é organizada',
    ],
    text: 'Na foto, uma placa indica "Popular Hard Cover Fiction" acima das prateleiras — uma sinalização simples que evita procurar livro por livro. O mesmo princípio vale para anotações digitais: separar o conteúdo por assunto no momento em que ele é salvo custa poucos segundos e economiza minutos de busca mais tarde.',
    category: 'Livros',
    subcategory: 'Biblioteca de estudo',
    topicPath: ['Biblioteca de estudo'],
    sources: [THEME_SOURCES.booksLibrary],
    favorite: false,
    createdAt: '2026-08-22T17:10:00.000Z',
  },
  {
    id: 'sample-note-8',
    seed: true,
    recordId: 'sample-4',
    image: studyAssets.books[1],
    images: [studyAssets.books[1]],
    title: 'Ler com atenção: o que muda na leitura ativa',
    summary: 'Ler de forma ativa significa se envolver com o texto em vez de apenas passar os olhos pelas linhas.',
    keyPoints: [
      'Leitura ativa exige atenção e pausas, não só passar os olhos pelo texto',
      'Grifar e reler trechos importantes ajuda a fixar o conteúdo',
      'Um ambiente com boa luz e foco facilita a concentração no material',
    ],
    text: 'Na imagem, os óculos apoiados sobre a página em foco mostram exatamente esse tipo de pausa: parar para reler um trecho, grifar uma frase importante ou simplesmente prestar mais atenção aos detalhes são sinais de que a leitura virou estudo, não só entretenimento. Esse hábito aumenta a retenção do conteúdo muito mais do que uma leitura corrida.',
    category: 'Livros',
    subcategory: 'Leitura ativa',
    topicPath: ['Leitura ativa'],
    sources: [THEME_SOURCES.booksOpen],
    favorite: false,
    createdAt: '2026-08-22T10:05:00.000Z',
  },
  {
    id: 'sample-note-9',
    seed: true,
    recordId: 'sample-1',
    image: `${ASSET_BASE}/demo-default-photo.jpg`,
    images: [`${ASSET_BASE}/demo-default-photo.jpg`, studyAssets.books[2]],
    title: 'The Photography Storytelling Workshop',
    summary: 'Livro de referência sobre como criar narrativas visuais por meio de sequência, enquadramento e contexto.',
    keyPoints: ['Imagem e sequência constroem sentido', 'O contexto guia a leitura', 'Referências ajudam a criar'],
    text: 'A capa fotografada mostra o subtítulo "A five-step guide to creating unforgettable photographs" — um roteiro de cinco etapas que o livro usa para transformar fotos soltas em uma sequência com começo, meio e fim. A fotografia pode conduzir uma história quando cada imagem contribui para uma ideia e a sequência cria uma experiência de leitura, do jeito que esse exemplar organizado em uma estante de referência sugere.',
    category: 'Livros',
    subcategory: 'Fotografia e narrativa',
    topicPath: ['Fotografia e narrativa'],
    sources: [],
    favorite: true,
    createdAt: '2026-08-21T15:25:00.000Z',
  },
  {
    id: 'sample-note-10',
    seed: true,
    recordId: 'sample-3',
    image: studyAssets.photography[0],
    images: [studyAssets.photography[0]],
    title: 'O que uma parede de câmeras vintage revela sobre a evolução da fotografia',
    summary: 'Uma estante com dezenas de câmeras antigas, de modelos com fole a câmeras compactas, mostra a fotografia migrando de equipamento profissional caro para objeto de uso comum.',
    keyPoints: [
      'Câmeras com fole precisavam de ajuste manual de foco e exposição',
      'Modelos compactos simplificaram a fotografia para o público geral',
      'Comparar câmeras de décadas diferentes lado a lado evidencia a evolução técnica',
    ],
    text: 'Na imagem, câmeras de diferentes décadas dividem a mesma prateleira — algumas com fole de couro, típicas do início do século 20, e outras já compactas e automáticas. Cada geração resolveu de um jeito diferente o mesmo problema: capturar luz em um filme sem exigir conhecimento técnico avançado do fotógrafo.',
    category: 'Fotografia',
    subcategory: 'Câmeras vintage e coleções',
    topicPath: ['Câmeras vintage e coleções'],
    sources: [THEME_SOURCES.cameraVintage],
    favorite: false,
    createdAt: '2026-08-21T09:40:00.000Z',
  },
  {
    id: 'sample-note-11',
    seed: true,
    recordId: 'sample-4',
    image: studyAssets.photography[1],
    images: [studyAssets.photography[1]],
    title: 'Por que colecionadores guardam câmeras em vitrines fechadas',
    summary: 'Uma vitrine de vidro reúne câmeras raras, incluindo um modelo com corpo de couro vermelho — peças frágeis demais para ficar expostas ao manuseio livre.',
    keyPoints: [
      'Peças raras ou frágeis costumam ficar isoladas do contato direto do público',
      'A cor e o material do corpo da câmera ajudam a datar aproximadamente o modelo',
      'Um acervo organizado facilita comparar modelos de épocas diferentes lado a lado',
    ],
    text: 'Repare que a vitrine da imagem protege as câmeras mais antigas e raras em um compartimento fechado, enquanto peças mais recentes ficam expostas em prateleiras abertas ao fundo. É a mesma lógica de um museu: quanto mais frágil ou raro o objeto, mais proteção ele recebe.',
    category: 'Fotografia',
    subcategory: 'Vitrines e acervos fotográficos',
    topicPath: ['Vitrines e acervos fotográficos'],
    sources: [THEME_SOURCES.cameraCollection],
    favorite: false,
    createdAt: '2026-08-20T13:15:00.000Z',
  },
  {
    id: 'sample-note-12',
    seed: true,
    recordId: 'sample-1',
    image: studyAssets.photography[2],
    images: [studyAssets.photography[2]],
    title: 'Como funcionava um filme fotográfico de 35mm',
    summary: 'Antes da fotografia digital, cada imagem era registrada quimicamente em uma tira de filme físico.',
    keyPoints: [
      'O filme registra a imagem por reação química, não eletronicamente',
      'As perfurações nas bordas alinham cada quadro dentro da câmera',
      'A luz revela os quadros antes de serem ampliados em papel',
    ],
    text: 'Na imagem, é possível ver as perfurações na borda do filme de 35mm, que garantiam o alinhamento correto de cada quadro dentro da câmera e do projetor. Segurar o filme contra a luz, como na foto, era a forma mais simples de conferir os quadros revelados antes de ampliá-los em papel.',
    category: 'Fotografia',
    subcategory: 'Filme fotográfico e processo analógico',
    topicPath: ['Filme fotográfico e processo analógico'],
    sources: [THEME_SOURCES.photographyFilm],
    favorite: false,
    createdAt: '2026-08-20T08:00:00.000Z',
  },
];

function getInitialNotes() {
  const stored = getNotes();
  const refreshedStored = stored.map((note) => {
    const sample = sampleNotes.find((item) => item.id === note.id);
    if (!sample) return note;
    return {
      ...note,
      image: sample.image,
      images: sample.images,
      topicPath: Array.isArray(note.topicPath) && note.topicPath.length > 1 ? note.topicPath : sample.topicPath,
    };
  });
  const missingSamples = sampleNotes.filter((sample) => !refreshedStored.some((note) => note.id === sample.id));
  const merged = [...refreshedStored, ...missingSamples];
  const changed = missingSamples.length || refreshedStored.some((note, index) => note !== stored[index]);
  if (!changed) return stored;
  persistNotes(merged);
  return merged;
}

export function AppDataProvider({ children }) {
  const [records, setRecords] = useState(samples);
  const [notes, setNotesState] = useState(getInitialNotes);
  const [aiHistory, setAiHistory] = useState(() => getHistory());
  const [plan, setPlanState] = useState(() => getPlan());
  const [user, setUserState] = useState(() => getUser());
  const [subjectArtifacts, setSubjectArtifactsState] = useState(() => getSubjectArtifacts());

  useEffect(() => {
    getAllMediaRecords().then((stored) => setRecords([...stored, ...samples]));
  }, []);

  const addRecord = useCallback(async ({ src, source = 'upload', label = 'Nova imagem', aiAvailable = true, mediaType = 'image' }) => {
    const record = {
      id: `media-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      src,
      source,
      label,
      aiAvailable,
      mediaType,
      createdAt: new Date().toISOString(),
      analysis: null,
    };
    setRecords((current) => [record, ...current]);
    await saveMediaRecord(record);
    return record;
  }, []);

  const updateRecord = useCallback(async (id, patch) => {
    const current = records.find((item) => item.id === id);
    if (!current) return null;
    const updated = { ...current, ...patch };
    setRecords((items) => items.map((item) => item.id === id ? updated : item));
    if (updated.source !== 'sample') await saveMediaRecord(updated);
    return updated;
  }, [records]);

  const removeRecord = useCallback(async (record) => {
    if (!record || record.source === 'sample') return;
    setRecords((current) => current.filter((item) => item.id !== record.id));
    await deleteMediaRecord(record.id);
  }, []);

  const saveNote = useCallback((record) => {
    if (!record?.analysis) return null;
    const existing = notes.find((item) => item.recordId === record.id && !item.seed);
    if (existing) return existing;
    const subcategory = record.analysis.subcategory || record.analysis.subject || record.analysis.contentType || 'Revisão';
    const note = {
      id: `note-${Date.now()}`,
      recordId: record.id,
      image: record.src,
      images: Array.isArray(record.images) && record.images.length ? record.images : [record.src].filter(Boolean),
      title: record.analysis.title || 'Nota JOVI',
      summary: record.analysis.summary || '',
      keyPoints: record.analysis.keyPoints || [],
      text: record.analysis.text || '',
      category: record.analysis.category || 'Estudos',
      subcategory,
      topicPath: Array.isArray(record.analysis.topicPath) && record.analysis.topicPath.length ? record.analysis.topicPath : [subcategory],
      favorite: false,
      createdAt: new Date().toISOString(),
    };
    const next = [note, ...notes];
    setNotesState(next);
    persistNotes(next);
    return note;
  }, [notes]);

  const removeNote = useCallback((id) => {
    const next = notes.filter((item) => item.id !== id);
    setNotesState(next);
    persistNotes(next);
  }, [notes]);

  const toggleNoteFavorite = useCallback((id) => {
    const next = notes.map((note) => note.id === id ? { ...note, favorite: !note.favorite } : note);
    setNotesState(next);
    persistNotes(next);
  }, [notes]);

  const addHistoryEntry = useCallback((entry) => {
    const historyEntry = {
      id: `history-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    setAiHistory((current) => {
      const next = [historyEntry, ...current].slice(0, 60);
      persistHistory(next);
      return next;
    });
    return historyEntry;
  }, []);

  const setPlan = useCallback((next) => {
    setPlanState(next);
    persistPlan(next);
  }, []);

  const setUser = useCallback((next) => {
    setUserState(next);
    persistUser(next);
  }, []);

  // Matérias derived from saved notes (category → subthemes + note bodies).
  // Uncategorized notes fall under "Outros", matching how SubjectNotes groups them.
  const subjects = useMemo(() => aggregateSubjects(notes), [notes]);

  // Persists one generated artifact (plan/exam/script/examResult) for a matéria.
  const saveSubjectArtifact = useCallback((subjectName, key, data) => {
    setSubjectArtifactsState((current) => {
      const next = { ...current, [subjectName]: { ...(current[subjectName] || {}), [key]: { data, savedAt: new Date().toISOString() } } };
      persistSubjectArtifacts(next);
      return next;
    });
  }, []);

  const getSubjectArtifact = useCallback((subjectName, key) => subjectArtifacts[subjectName]?.[key] || null, [subjectArtifacts]);

  const value = useMemo(() => ({
    records, notes, aiHistory, plan, user, subjects, subjectArtifacts,
    addRecord, updateRecord, removeRecord, saveNote, removeNote, toggleNoteFavorite, addHistoryEntry, setPlan, setUser, saveSubjectArtifact, getSubjectArtifact,
  }), [records, notes, aiHistory, plan, user, subjects, subjectArtifacts, addRecord, updateRecord, removeRecord, saveNote, removeNote, toggleNoteFavorite, addHistoryEntry, setPlan, setUser, saveSubjectArtifact, getSubjectArtifact]);

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}

export function useAppData() {
  const value = useContext(AppDataContext);
  if (!value) throw new Error('useAppData must be used inside AppDataProvider');
  return value;
}
