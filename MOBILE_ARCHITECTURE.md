# JOVI Lens — arquitetura mobile

Esta versão transforma o protótipo React existente em uma experiência mobile-first centrada no fluxo **foto → entendimento → ação**.

## Entradas de apresentação

- `/camera`: abre diretamente a experiência de câmera.
- `/gallery`: abre diretamente a galeria.
- `/notes`: histórico de notas inteligentes salvas.
- `/profile`: conta Google, trial e assinatura.

Em telas desktop/tablet, o shell renderiza o app dentro de uma moldura baseada no viewport lógico do iPhone 16 (393 × 852). Em um telefone real, a moldura e os botões físicos desaparecem e o app ocupa `100dvh` com safe areas.

## IA e OCR reais

O antigo serviço mock não participa do novo fluxo. A foto é reduzida no navegador para reduzir payload/latência e enviada a `POST /api/analyze-image`. A função serverless chama o Google Gemini de forma multimodal e devolve em uma única resposta:

- OCR/transcrição fiel;
- idioma;
- título;
- resumo;
- pontos-chave;
- categoria.

A chave `GEMINI_API_KEY` fica apenas no backend da Vercel. Nunca use uma chave Gemini em variável `VITE_*`.

## Google Sign-In e assinatura

Google Sign-In usa `VITE_GOOGLE_CLIENT_ID` no cliente e valida o ID token novamente no backend com `GOOGLE_CLIENT_ID`. Isso identifica a conta do usuário, mas **não** concede acesso à assinatura Google AI/Gemini do usuário.

A assinatura JOVI é um produto separado. O protótipo suporta plano gratuito e trial local de 7 dias. O botão de assinatura só redireciona para `VITE_BILLING_CHECKOUT_URL` quando um checkout real for configurado; sem essa URL, não há cobrança falsa.

## Persistência

- Fotos capturadas/importadas e análises: IndexedDB.
- Notas, plano e sessão de demonstração: localStorage.
- Imagens originais do projeto continuam sendo reutilizadas como conteúdo inicial da galeria.

## Vercel

Configure as variáveis de `.env.example`. As rotas SPA têm rewrites explícitos em `vercel.json`. As funções em `/api` permanecem server-side.
