# JOVI Lens Mobile

Nova experiência mobile-first do projeto JOVI, construída sobre React + Vite e executada localmente com Azure OpenAI.

## Rotas de apresentação

- `/camera` — câmera nativa do navegador + captura; a IA é opcional por imagem.
- `/gallery` — galeria de fotos com visualização normal, Notas, Histórico e a seção Copilot.
- `/notes` — notas geradas e salvas.
- `/copilot` — aba demonstrativa do modelo avançado, com teste de 7 dias ou conexão de uma assinatura existente.
- `/profile` — conta de demonstração e acesso demonstrativo ao Copilot, sem login ou cobrança real.

## IA

O fluxo real usa Azure OpenAI atrás de uma camada de serviço em `api/_lib/ai/`. O navegador nunca recebe a chave: a imagem passa por `POST /api/analyze-image`, que valida o payload, aplica timeout e normaliza a resposta para o contrato educacional do produto.

Para uma apresentação sem dependência de rede, ative o Demo Mode. O mock fica separado em `services/demoResponses.js` e reproduz análise, explicação, resolução, pergunta, quiz e flashcards.

Capturas comuns continuam sendo apenas fotos na galeria. Ao abrir uma captura, a imagem ocupa o visualizador e oferece três ações independentes: copiar o texto lido, pesquisar o texto no Google ou escolher "Usar IA" para iniciar uma sessão de estudo. Algumas referências de exemplo estão marcadas como biblioteca e não entram na análise educacional.

## Conta e Copilot (demo)

O fluxo do perfil é propositalmente local para a apresentação: "Entrar como estudante" cria uma conta fictícia no `localStorage`, e "Ativar acesso Copilot · Demo" libera um plano demonstrativo. Nenhuma conta externa, assinatura ou cobrança é realizada.

A aba `/copilot` apresenta o modelo avançado como uma extensão premium do JOVI Lens. Ela oferece dois caminhos de demonstração: iniciar um teste de 7 dias ou simular a conexão de uma assinatura Copilot já existente. Após ativar, o botão "Abrir câmera com Copilot" leva à experiência principal. O modelo e a assinatura são ilustrativos nesta versão.

## Rodar localmente

```bash
npm install
npm run dev
```

O comando inicia o frontend Vite em `http://127.0.0.1:5173` e a API local Node em `http://127.0.0.1:8787`. O frontend encaminha `/api/analyze-image` para essa API local, sem depender de uma plataforma externa. Para abrir a galeria, use `http://127.0.0.1:5173/gallery`; a API também redireciona `http://127.0.0.1:8787/gallery` para essa tela por conveniência.

## Variáveis locais

Copie `.env.example` para `.env` e configure os valores localmente. `AZURE_OPENAI_API_KEY` é server-only e nunca deve usar prefixo `VITE_`. O arquivo de exemplo deve permanecer sem valores reais.

Principais variáveis:

```text
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_API_KEY=
AZURE_OPENAI_DEPLOYMENT=
AZURE_OPENAI_API_VERSION=2024-12-01-preview
JOVI_LENS_DEMO_MODE=false
VITE_JOVI_LENS_DEMO_MODE=false
JOVI_WEB_URL=http://127.0.0.1:5173
```

Para uma apresentação sem rede, defina os dois flags como `true`. Para usar a Azure localmente, mantenha os dois como `false` e reinicie `npm run dev` depois de alterar o `.env`.

## Produção

```bash
npm run build
```

O build gera os arquivos estáticos em `dist/`. Em desenvolvimento, `scripts/dev.js` coordena o Vite e `server/local-api.js`; em produção, hospede o frontend e essa API Node no ambiente local ou em um servidor sob seu controle.
