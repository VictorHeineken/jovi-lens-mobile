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
  const cleaned = String(text || '')
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Resposta da IA não estava em JSON.');
    return JSON.parse(match[0]);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      code: 'OPENROUTER_NOT_CONFIGURED',
      message: 'OpenRouter ainda não está configurado neste ambiente.',
    });
  }

  const { image, mimeType = 'image/jpeg' } = req.body || {};

  if (!image || typeof image !== 'string') {
    return res.status(400).json({ message: 'Imagem inválida.' });
  }

  if (image.length > 8_000_000) {
    return res.status(413).json({ message: 'Imagem grande demais para análise.' });
  }

  const model = process.env.OPENROUTER_MODEL || 'google/gemma-4-26b-a4b-it:free';
  const appUrl = process.env.OPENROUTER_APP_URL || req.headers.origin || '';

  try {
    const headers = {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'X-OpenRouter-Title': 'JOVI Lens Mobile',
    };

    if (appUrl) headers['HTTP-Referer'] = appUrl;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: PROMPT,
              },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${image}`,
                },
              },
            ],
          },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 1200,
      }),
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const message = payload?.error?.message || 'Falha ao consultar o modelo pelo OpenRouter.';
      return res.status(response.status).json({ message });
    }

    const modelText = payload?.choices?.[0]?.message?.content;

    if (!modelText) {
      return res.status(502).json({ message: 'O modelo não retornou conteúdo analisável.' });
    }

    const result = jsonFromModelText(modelText);

    return res.status(200).json({
      text: String(result.text || ''),
      language: String(result.language || 'auto'),
      title: String(result.title || 'Conteúdo identificado'),
      summary: String(result.summary || 'Imagem analisada com Google Gemma via OpenRouter.'),
      keyPoints: Array.isArray(result.keyPoints)
        ? result.keyPoints.slice(0, 5).map(String)
        : [],
      category: String(result.category || 'Outros'),
      provider: 'openrouter',
      modelVendor: 'google',
      model,
    });
  } catch (error) {
    return res.status(500).json({
      message: error?.message || 'Erro interno ao analisar a imagem.',
    });
  }
}
