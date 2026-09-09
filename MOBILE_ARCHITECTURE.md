# JOVI Lens — arquitetura mobile

Esta versão transforma o protótipo React existente em uma experiência mobile-first centrada no fluxo **foto → visualização → ação escolhida**.

## Entradas de apresentação

- `/camera`: abre diretamente a experiência de câmera.
- `/gallery`: abre diretamente a galeria, com Fotos, Álbuns, Notas, Histórico e Copilot na navegação inferior.
- `/notes`: histórico de notas inteligentes salvas.
- `/copilot`: aba demonstrativa do modelo avançado e seus caminhos de acesso.
- `/profile`: conta de demonstração, trial fictício e acesso demonstrativo ao Copilot.

Em telas desktop/tablet, o shell renderiza o app dentro de uma moldura baseada na proporção do JOVI X300 Ultra (393 × 852 lógico), com punch-hole central e acabamento verde-sálvia inspirado na referência atual da marca. Em um telefone real, a moldura e os botões físicos desaparecem e o app ocupa `100dvh` com safe areas.

## IA e OCR reais

Ao abrir uma captura, o frontend mostra a imagem em um visualizador completo, com ações para copiar o texto, pesquisar o texto no Google ou iniciar a IA educacional. A leitura de texto só é solicitada quando uma dessas ações é usada; a análise de estudo não começa automaticamente.

O frontend reduz a foto no navegador para reduzir payload/latência e envia a `POST /api/analyze-image`.

A API local Node chama Azure OpenAI por meio de uma camada de serviço/provider. O fluxo é `frontend → proxy Vite → server/local-api.js → api/analyze-image.js → api/_lib/ai/service.js → providers/azureOpenAI.js → Azure OpenAI`. A resposta contém:

- OCR/transcrição fiel;
- idioma;
- título;
- resumo;
- pontos-chave;
- categoria;
- trilha Entender → Resolver → Praticar;
- perguntas sugeridas e flashcards.

Para copiar ou pesquisar texto sem abrir a sessão educacional, a mesma rota aceita `action: "extract"` e retorna somente a transcrição normalizada.

A chave `AZURE_OPENAI_API_KEY` fica apenas no processo Node local. Nunca use essa chave em variável `VITE_*`.

O endpoint valida tipo/tamanho/base64 da imagem, limita requisições por janela, trata timeout, rate limit, resposta vazia e resposta inválida. As mensagens públicas são genéricas; detalhes do erro não são expostos.

## Demo Mode

`services/demoResponses.js` mantém respostas realistas para análise inicial, explicar, resolver, perguntar, quiz e flashcards. `VITE_JOVI_LENS_DEMO_MODE=true` evita a chamada de rede no cliente; `JOVI_LENS_DEMO_MODE=true` também habilita o provider demo no backend. Para usar Azure OpenAI, defina ambos como `false` e configure `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT` e `AZURE_OPENAI_API_VERSION`.

## Conta e Copilot demonstrativos

O perfil não dispara login externo. O botão de entrada cria a estudante fictícia Ana Beatriz e persiste a sessão no `localStorage`, para que o fluxo de apresentação seja repetível mesmo sem rede.

O trial de 7 dias e a ativação do Copilot também são estados locais e explicitamente identificados como demo. Não existe checkout, assinatura ou cobrança neste protótipo; uma integração real pode ser adicionada depois sem misturar essa experiência com a camada visual.

A aba Copilot permite iniciar o trial de 7 dias ou simular que a pessoa já possui uma assinatura paga. Ambos os caminhos atualizam o plano local e exibem o modelo avançado como selecionado. O CTA de câmera apenas conduz à experiência existente; a troca de modelo real continua fora do escopo desta demonstração.

## Persistência

- Fotos capturadas/importadas e análises: IndexedDB.
- Notas, plano e sessão de demonstração: localStorage, com conteúdo inicial de exemplo sem sobrescrever notas do usuário.
- Imagens originais do projeto continuam sendo reutilizadas como conteúdo inicial da galeria.
- Backup local: o Perfil exporta notas, histórico, preferências, artefatos do Estúdio e mídias do usuário em JSON; a restauração valida a versão, mescla mídias por identificador e substitui o restante dos dados locais após confirmação.
- Busca: Notas e Histórico usam a mesma busca normalizada por acentos, cobrindo títulos, matérias, subtemas, tags, OCR, respostas e rótulos de mídia.
- Organização: notas podem ser editadas sem perder sua imagem de origem, incluindo título, matéria, subtema, tags, resumo e texto.
- Captura de documentos: o modo `DOCUMENTOS` salva páginas sequenciais com `collectionId` e `pageNumber`, permitindo ordenar uma digitalização simples sem afirmar correção geométrica automática.
- Privacidade: o Perfil permite limpar mídias, notas, histórico, plano demonstrativo e artefatos locais após confirmação; os exemplos iniciais são preservados para a apresentação.
- Preferências de aprendizagem: o Perfil permite escolher estilo da aula (animada, equilibrada, calma ou focada em exercícios), duração e nível; essas escolhas são persistidas localmente e entram na busca de vídeo.
- Aulas externas: a Azure OpenAI cria a consulta de busca com base na matéria e nas preferências; `api/_lib/youtube.js` consulta a YouTube Data API v3 server-side e devolve links oficiais, sem expor `YOUTUBE_API_KEY` ao navegador.
- Feedback e trilha: recomendações podem ser marcadas como úteis ou não úteis e salvas no artefato `youtubeLessons`; aulas salvas aparecem no Plano da matéria. O próximo pedido usa os subtemas com pior resultado do simulado como foco adicional.

## Execução local

`npm run dev` inicia `scripts/dev.js`, que abre o servidor Node em `127.0.0.1:8787` e o Vite em `127.0.0.1:5173`. O proxy do Vite mantém o contrato `/api/analyze-image` sem expor a chave ao navegador. Também é possível iniciar apenas a API com `npm run dev:api`.

As rotas de IA usam dois níveis de proteção local: rate limit por janela curta e limite diário por recurso
(análise, matéria, TTS, transcrição e vídeo). A proteção diária ainda é em memória e chaveada pelo IP
do processo local; não deve ser tratada como quota de produção ou substituto de autenticação.

A busca de aulas usa o mesmo princípio: limite curto e limite diário no endpoint
`/api/youtube-recommendations`. Em produção, a chave do YouTube deve ser restrita no Google Cloud e o
limite deve ser compartilhado por usuário autenticado, porque a API oficial trabalha com quota.
