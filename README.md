# JOVI Lens Mobile

Nova experiência mobile-first do projeto JOVI, construída sobre React + Vite e preparada para Vercel.

## Rotas de apresentação

- `/camera` — câmera nativa do navegador + captura + OCR/IA.
- `/gallery` — galeria de fotos com o mesmo pipeline inteligente.
- `/notes` — notas geradas e salvas.
- `/profile` — Google Sign-In, plano gratuito, trial e integração opcional com checkout real.

## Rodar localmente

```bash
npm install
npm run dev
```

## Variáveis Vercel

Copie `.env.example` e configure as variáveis no projeto Vercel. `GEMINI_API_KEY` é server-only e nunca deve usar prefixo `VITE_`.

## Produção

```bash
npm run build
```

O arquivo `vercel.json` contém os rewrites necessários para abrir diretamente as rotas SPA.
