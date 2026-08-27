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

export { RESPONSE_SHAPE };
