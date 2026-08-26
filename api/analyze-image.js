const PROMPT = `Você é o motor visual do aplicativo JOVI Lens. Analise a imagem com foco em texto visível e utilidade para estudo.
Retorne SOMENTE JSON válido, sem markdown, exatamente com este formato:
{
  "text": "transcrição fiel de todo texto legível, preservando quebras importantes",
  "language": "idioma principal em código curto, ex: pt, en",
  "title": "título curto e útil",
  "summary": "resumo claro em português do Brasil, de 2 a 4 frases",
  "keyPoints": ["ponto 1", "ponto 2", "ponto 3"],
  "category": "uma categoria curta, por exemplo Estudos, Documento, Produto, Livro, Trabalho ou Outros"
}
Não invente texto que não esteja visível. Se não houver texto legível, use text="" e resuma apenas o conteúdo visual de forma breve.`;

function jsonFromModelText(text) {
  const cleaned = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  try { return JSON.parse(cleaned); } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta da IA não estava em JSON.');
    return JSON.parse(match[0]);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(503).json({ code: 'GEMINI_NOT_CONFIGURED', message: 'Gemini ainda não está configurado neste ambiente.' });

  const { image, mimeType = 'image/jpeg' } = req.body || {};
  if (!image || typeof image !== 'string') return res.status(400).json({ message: 'Imagem inválida.' });
  if (image.length > 8_000_000) return res.status(413).json({ message: 'Imagem grande demais para análise.' });

  const model = process.env.GEMINI_MODEL || 'gemini-3.7-flash';
  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ parts: [{ inline_data: { mime_type: mimeType, data: image } }, { text: PROMPT }] }],
        generationConfig: { responseMimeType: 'application/json' },
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || 'Falha ao consultar Gemini.';
      return res.status(response.status).json({ message });
    }

    const modelText = payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim();
    if (!modelText) return res.status(502).json({ message: 'Gemini não retornou conteúdo analisável.' });
    const result = jsonFromModelText(modelText);
    return res.status(200).json({
      text: String(result.text || ''),
      language: String(result.language || 'auto'),
      title: String(result.title || 'Conteúdo identificado'),
      summary: String(result.summary || 'Imagem analisada com Google Gemini.'),
      keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints.slice(0, 5).map(String) : [],
      category: String(result.category || 'Outros'),
      provider: 'google-gemini',
      model,
    });
  } catch (error) {
    return res.status(500).json({ message: error?.message || 'Erro interno ao analisar a imagem.' });
  }
}
