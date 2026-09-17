const RESPONSE_SHAPE = `
Retorne SOMENTE JSON válido, sem markdown. Para uma análise inicial, use exatamente este formato:
{
  "text": "transcrição fiel do texto legível",
  "language": "pt",
  "title": "título curto",
  "summary": "resumo claro em português do Brasil",
  "keyPoints": ["ponto 1", "ponto 2", "ponto 3"],
  "category": "Matemática",
  "contentType": "Exercício",
  "subject": "disciplina ou tema",
  "confidence": 0.0,
  "suggestedQuestions": ["pergunta útil"],
  "learning": {
    "understand": { "title": "...", "intro": "...", "steps": [{"label":"...","text":"..."}] },
    "solve": { "title": "...", "prompt": "...", "answer": "...", "steps": ["..."] },
    "practice": { "title": "...", "question": "...", "options": ["..."], "answerIndex": 0, "feedback": "...", "hint": "..." },
    "flashcards": [{"front":"...","back":"..."}]
  }
}
Não invente texto que não esteja visível. Quando não houver exercício, explique o conteúdo e deixe solve/practice adaptados ao tema. Priorize aprender, não apenas entregar respostas.
`.trim();

export function buildAnalysisPrompt() {
  return `Você é a inteligência educacional do JOVI Lens. Analise a imagem para ajudar um estudante a entender o conteúdo capturado. Escreva em português do Brasil, com clareza, objetividade e passos curtos. ${RESPONSE_SHAPE}`;
}

export function buildTextExtractionPrompt() {
  return 'Você é o OCR do JOVI Lens. Leia somente o texto claramente visível na imagem e preserve a ordem, acentos, números e fórmulas simples. Não faça resumo e não invente conteúdo. Retorne SOMENTE JSON válido no formato {"text":"transcrição fiel","language":"pt","confidence":0.0}.';
}

export function buildActionPrompt({ action, question, context }) {
  const actionInstruction = action === 'ask'
    ? `Responda à pergunta do estudante mantendo o contexto da imagem. Retorne {"action":"ask","reply":"resposta didática em até 4 frases"}. Pergunta: ${question}`
    : `A imagem já foi analisada. Gere somente o bloco solicitado e retorne {"action":"${action}","learning":{...}}. Para explain use understand; para solve use solve; para quiz use practice; para flashcards use flashcards.`;
  return `Você é a inteligência educacional do JOVI Lens. Continue uma sessão de estudo com base no conteúdo capturado. Contexto da análise: ${JSON.stringify(context).slice(0, 12000)}. ${actionInstruction} Não use markdown fora do JSON.`;
}

// ---------------------------------------------------------------------------
// Subject-level prompts: operate over ALL notes of a matéria, not a single image.
// ---------------------------------------------------------------------------

// Serializes the aggregated notes of a matéria into a compact study context.
export function buildSubjectContext(subject) {
  const name = String(subject?.name || subject?.subject || 'Matéria').slice(0, 80);
  const notes = Array.isArray(subject?.notes) ? subject.notes : [];
  const lines = notes.slice(0, 40).map((note, index) => {
    const topic = note.subtheme || note.subcategory || (Array.isArray(note.topicPath) ? note.topicPath[0] : '') || 'Geral';
    const points = Array.isArray(note.keyPoints) && note.keyPoints.length ? ` Pontos: ${note.keyPoints.join('; ')}.` : '';
    const body = String(note.text || note.summary || '').slice(0, 700);
    return `(${index + 1}) [${topic}] ${String(note.title || 'Conteúdo').slice(0, 120)} — ${body}${points}`;
  });
  const subthemes = [...new Set(notes.map((note) => note.subtheme || note.subcategory || (Array.isArray(note.topicPath) ? note.topicPath[0] : '')).filter(Boolean))];
  return {
    name,
    subthemes,
    count: notes.length,
    text: `Matéria: ${name}.\nSubtemas: ${subthemes.join(', ') || 'variados'}.\nConteúdos estudados pelo aluno:\n${lines.join('\n')}`.slice(0, 12000),
  };
}

const SUBJECT_PERSONA = 'Você é a inteligência educacional do JOVI Lens. Trabalhe SOBRE TODO o conteúdo da matéria do aluno (não sobre uma única imagem). Escreva em português do Brasil, claro e objetivo. Retorne SOMENTE JSON válido, sem markdown.';

export function learningPreferenceContext(preferences = {}) {
  const goalLabels = {
    vestibular: 'vestibular: cobre conceitos, interpretação e comparação entre temas, com pegada de banca',
    enem: 'ENEM: contextualize com problemas, linguagem interdisciplinar e leitura crítica',
    school_exam: 'prova da escola: priorize o que costuma cair em avaliação objetiva e discursiva próxima',
    general: 'revisão geral: consolide fundamentos e conexões entre subtemas',
  };
  const levelLabels = { beginner: 'iniciante', intermediate: 'intermediário', advanced: 'avançado' };
  const durationLabels = { short: 'estudos curtos', standard: 'sessões médias', long: 'aprofundamento' };
  return `Preferências do estudante: objetivo principal = ${goalLabels[preferences.studyGoal] || goalLabels.vestibular}; nível = ${levelLabels[preferences.level] || levelLabels.intermediate}; tempo preferido = ${durationLabels[preferences.duration] || durationLabels.standard}. Use essas preferências para escolher dificuldade, exemplos, linguagem e prioridade dos subtemas.`;
}

export function buildSubjectQuestionsPrompt(subject, preferences = {}) {
  const ctx = buildSubjectContext(subject);
  return `${SUBJECT_PERSONA} Gere de 6 a 10 perguntas de estudo que cubram a matéria "${ctx.name}" como um todo, misturando os subtemas e níveis de dificuldade. Cada pergunta deve seguir o objetivo do aluno. Para vestibular/ENEM, inclua raciocínio aplicado e comparação; para prova da escola, inclua cobrança direta e resposta clara. Cada pergunta deve ter uma resposta-modelo curta. ${learningPreferenceContext(preferences)} Formato exato:
{"subject":"${ctx.name}","questions":[{"question":"...","answer":"resposta-modelo em até 3 frases","topic":"subtema","difficulty":"fácil|média|difícil"}]}
Contexto:\n${ctx.text}`;
}

export function buildSubjectExamPrompt(subject, preferences = {}) {
  const ctx = buildSubjectContext(subject);
  return `${SUBJECT_PERSONA} Monte um simulado de múltipla escolha cobrindo a matéria "${ctx.name}" inteira. Gere de 6 a 10 questões, cada uma com 4 alternativas plausíveis e apenas uma correta, distribuídas entre os subtemas. Ajuste o estilo ao objetivo do aluno: vestibular/ENEM deve ter enunciados contextualizados e distratores plausíveis; prova da escola deve cobrar definição, causa, consequência e relação direta. ${learningPreferenceContext(preferences)} Inclua o índice da alternativa correta (0 a 3) e uma explicação curta. Formato exato:
{"subject":"${ctx.name}","durationMinutes":10,"questions":[{"question":"...","options":["a","b","c","d"],"answerIndex":0,"explanation":"por que a correta está certa","topic":"subtema"}]}
Contexto:\n${ctx.text}`;
}

export function buildStudyPlanPrompt(subject, preferences = {}) {
  const ctx = buildSubjectContext(subject);
  return `${SUBJECT_PERSONA} Crie um plano de estudos adaptativo e realista para a matéria "${ctx.name}", com base no que o aluno já estudou. Priorize revisão espaçada, os subtemas mais densos e o objetivo principal do aluno. ${learningPreferenceContext(preferences)} Formato exato:
{"subject":"${ctx.name}","overview":"1-2 frases de estratégia","sessions":[{"label":"Dia 1","focus":"subtema/tema","durationMinutes":30,"tasks":["tarefa concreta"]}],"spacedReview":[{"topic":"subtema","when":"em 1 dia|em 3 dias|em 1 semana"}]}
Gere de 4 a 6 sessões. Contexto:\n${ctx.text}`;
}

export function buildPodcastScriptPrompt(subject, { format = 'dialogue', preferences = {} } = {}) {
  const ctx = buildSubjectContext(subject);
  const preferenceLine = learningPreferenceContext(preferences);
  if (format === 'drive') {
    return `${SUBJECT_PERSONA} Escreva um episódio de podcast para ouvir no carro sobre a matéria "${ctx.name}". O aluno não deve precisar olhar a tela. Use linguagem falada, transições claras entre blocos, exemplos simples, pequenas retomadas do que acabou de ser explicado e frases com cadência de fala humana. ${preferenceLine} Não peça atividades que exigem escrever ou tocar no celular enquanto dirige. Formato exato:
{"subject":"${ctx.name}","format":"drive","title":"título do episódio","durationMinutes":12,"takeaways":["ideia que o aluno deve lembrar"],"segments":[{"speaker":"narrator","text":"fala natural, 2-4 frases"}]}
Gere de 12 a 20 segmentos. Contexto:\n${ctx.text}`;
  }
  if (format === 'single') {
    return `${SUBJECT_PERSONA} Escreva o roteiro de um episódio curto de podcast (locutor único) que ensine a matéria "${ctx.name}" de forma envolvente, com introdução, desenvolvimento pelos subtemas e um fechamento com dica de estudo. Linguagem falada, natural, com pausas sugeridas pela pontuação e sem tom de texto lido. ${preferenceLine} Formato exato:
{"subject":"${ctx.name}","format":"single","title":"título do episódio","segments":[{"speaker":"narrator","text":"fala natural, 2-4 frases"}]}
Gere de 8 a 14 segmentos. Contexto:\n${ctx.text}`;
  }
  return `${SUBJECT_PERSONA} Escreva o roteiro de um episódio de podcast no estilo conversa entre DOIS apresentadores (A = anfitriã curiosa, B = especialista) sobre a matéria "${ctx.name}". Diálogo natural, com perguntas, exemplos, retomadas curtas e um resumo final. As falas devem soar como conversa real: frases curtas, pausas naturais pela pontuação, sem jargão e sem blocos longos. ${preferenceLine} Alterne as falas. Formato exato:
{"subject":"${ctx.name}","format":"dialogue","title":"título do episódio","segments":[{"speaker":"A","text":"fala natural"},{"speaker":"B","text":"fala natural"}]}
Gere de 10 a 18 segmentos alternando A e B. Contexto:\n${ctx.text}`;
}

export function buildLessonScriptPrompt(subject, preferences = {}) {
  const ctx = buildSubjectContext(subject);
  return `${SUBJECT_PERSONA} Escreva o roteiro de uma vídeo aula personalizada sobre a matéria "${ctx.name}", em formato de slides narrados. Cada slide tem um título, de 2 a 4 tópicos curtos e uma narração natural (2-4 frases) que será convertida em voz. ${learningPreferenceContext(preferences)} Formato exato:
{"subject":"${ctx.name}","title":"título da aula","slides":[{"heading":"título do slide","bullets":["tópico"],"narration":"narração falada"}]}
Gere de 5 a 8 slides, do introdutório ao avançado. Contexto:\n${ctx.text}`;
}

export function buildVideoRecommendationsPrompt(subject, preferences = {}) {
  const ctx = buildSubjectContext(subject);
  const styleLabels = {
    animated: 'dinâmica, visual, com energia e exemplos gráficos',
    balanced: 'equilibrada, clara e com ritmo moderado',
    calm: 'calma, detalhada e passo a passo',
    exam: 'focada em exercícios, resolução de questões e revisão para prova',
  };
  const goalLabels = {
    vestibular: 'preparação para vestibular, com comparação de conceitos e questões de banca',
    enem: 'preparação para ENEM, com contexto interdisciplinar e interpretação',
    school_exam: 'preparação para prova da escola, com revisão direta do conteúdo que costuma cair',
    general: 'revisão geral para consolidar fundamentos',
  };
  const durationLabels = { short: 'curta, de até 15 minutos', standard: 'média, entre 15 e 40 minutos', long: 'aprofundada, com mais de 40 minutos' };
  const levelLabels = { beginner: 'iniciante', intermediate: 'intermediário', advanced: 'avançado' };
  const style = styleLabels[preferences.videoStyle] || styleLabels.balanced;
  const duration = durationLabels[preferences.duration] || durationLabels.standard;
  const level = levelLabels[preferences.level] || levelLabels.intermediate;
  const goal = goalLabels[preferences.studyGoal] || goalLabels.vestibular;
  const weakTopics = Array.isArray(subject?.weakTopics) && subject.weakTopics.length ? ` O simulado indicou dificuldade nestes pontos: ${subject.weakTopics.slice(0, 5).join(', ')}. Priorize-os na consulta.` : '';
  return `${SUBJECT_PERSONA} Você vai recomendar pesquisas de vídeo aula para a matéria "${ctx.name}" sem chamar API externa e sem inventar vídeos específicos como se fossem verificados. Use apenas o conteúdo da matéria e os subtemas abaixo. O estudante tem foco em ${goal}; prefere uma aula ${style}, ${duration}, adequada ao nível ${level}.${weakTopics} Gere de 3 a 5 cards de busca com termos em português do Brasil, foco didático e critérios para o aluno avaliar se a aula encontrada serve. Não retorne links diretos de vídeos, nomes de canais ou métricas que você não verificou. Formato exato:
{"query":"busca principal curta","focus":"o foco específico da recomendação em uma frase","recommendations":[{"title":"tipo de aula a procurar","searchQuery":"termos exatos para buscar","description":"por que esta busca ajuda","didacticReason":"o que observar na didática","watchFor":["critério objetivo"],"estimatedMinutes":20}]}
Contexto da matéria:
${ctx.text}`;
}

export { RESPONSE_SHAPE };
