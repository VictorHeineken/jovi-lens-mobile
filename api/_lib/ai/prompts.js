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

export function buildSubjectQuestionsPrompt(subject) {
  const ctx = buildSubjectContext(subject);
  return `${SUBJECT_PERSONA} Gere de 6 a 10 perguntas de estudo que cubram a matéria "${ctx.name}" como um todo, misturando os subtemas e níveis de dificuldade. Cada pergunta deve ter uma resposta-modelo curta. Formato exato:
{"subject":"${ctx.name}","questions":[{"question":"...","answer":"resposta-modelo em até 3 frases","topic":"subtema","difficulty":"fácil|média|difícil"}]}
Contexto:\n${ctx.text}`;
}

export function buildSubjectExamPrompt(subject) {
  const ctx = buildSubjectContext(subject);
  return `${SUBJECT_PERSONA} Monte um simulado de múltipla escolha cobrindo a matéria "${ctx.name}" inteira. Gere de 6 a 10 questões, cada uma com 4 alternativas plausíveis e apenas uma correta, distribuídas entre os subtemas. Inclua o índice da alternativa correta (0 a 3) e uma explicação curta. Formato exato:
{"subject":"${ctx.name}","durationMinutes":10,"questions":[{"question":"...","options":["a","b","c","d"],"answerIndex":0,"explanation":"por que a correta está certa","topic":"subtema"}]}
Contexto:\n${ctx.text}`;
}

export function buildStudyPlanPrompt(subject) {
  const ctx = buildSubjectContext(subject);
  return `${SUBJECT_PERSONA} Crie um plano de estudos adaptativo e realista para a matéria "${ctx.name}", com base no que o aluno já estudou. Priorize revisão espaçada e os subtemas mais densos. Formato exato:
{"subject":"${ctx.name}","overview":"1-2 frases de estratégia","sessions":[{"label":"Dia 1","focus":"subtema/tema","durationMinutes":30,"tasks":["tarefa concreta"]}],"spacedReview":[{"topic":"subtema","when":"em 1 dia|em 3 dias|em 1 semana"}]}
Gere de 4 a 6 sessões. Contexto:\n${ctx.text}`;
}

export function buildPodcastScriptPrompt(subject, { format = 'dialogue' } = {}) {
  const ctx = buildSubjectContext(subject);
  if (format === 'single') {
    return `${SUBJECT_PERSONA} Escreva o roteiro de um episódio curto de podcast (locutor único) que ensine a matéria "${ctx.name}" de forma envolvente, com introdução, desenvolvimento pelos subtemas e um fechamento com dica de estudo. Linguagem falada e natural. Formato exato:
{"subject":"${ctx.name}","format":"single","title":"título do episódio","segments":[{"speaker":"narrator","text":"fala natural, 2-4 frases"}]}
Gere de 8 a 14 segmentos. Contexto:\n${ctx.text}`;
  }
  return `${SUBJECT_PERSONA} Escreva o roteiro de um episódio de podcast no estilo conversa entre DOIS apresentadores (A = anfitriã curiosa, B = especialista) sobre a matéria "${ctx.name}". Diálogo natural, com perguntas, exemplos e um resumo final. Alterne as falas. Formato exato:
{"subject":"${ctx.name}","format":"dialogue","title":"título do episódio","segments":[{"speaker":"A","text":"fala natural"},{"speaker":"B","text":"fala natural"}]}
Gere de 10 a 18 segmentos alternando A e B. Contexto:\n${ctx.text}`;
}

export function buildLessonScriptPrompt(subject) {
  const ctx = buildSubjectContext(subject);
  return `${SUBJECT_PERSONA} Escreva o roteiro de uma vídeo aula personalizada sobre a matéria "${ctx.name}", em formato de slides narrados. Cada slide tem um título, de 2 a 4 tópicos curtos e uma narração natural (2-4 frases) que será convertida em voz. Inclua também um "soraPrompt": uma descrição visual curta (1 frase, em inglês) para um clipe de abertura cinematográfico e abstrato sobre o tema, sem texto na tela. Formato exato:
{"subject":"${ctx.name}","title":"título da aula","soraPrompt":"cinematic abstract ...","slides":[{"heading":"título do slide","bullets":["tópico"],"narration":"narração falada"}]}
Gere de 5 a 8 slides, do introdutório ao avançado. Contexto:\n${ctx.text}`;
}

export { RESPONSE_SHAPE };
