# JOVI Lens — app web

Experiência mobile-first do JOVI Lens construída sobre React + Vite. Esta é a versão web/PWA original do
projeto — para a versão React Native, veja o [README na raiz do repositório](../README.md) e o
[plano de migração](../react-native-migration-plan.md).

## Rotas de apresentação

- `/camera` — câmera nativa do navegador + captura; a IA é opcional por imagem.
- `/gallery` — galeria de fotos com visualização normal, Notas, Histórico e Perfil.
- `/notes` — notas geradas e salvas.
- `/copilot` — redireciona para `/profile` para manter compatibilidade com links antigos.
- `/profile` — conta de demonstração e acesso demonstrativo ao Copilot, sem login ou cobrança real.

Na área `/notes` e no Histórico existe busca por notas, pesquisas e mídias. Notas salvas podem ser
editadas por título, matéria, subtema, tags, resumo e texto. A câmera também oferece um modo
`DOCUMENTOS` para salvar várias páginas na mesma sessão, com contraste de leitura e metadados de
ordenação. O Perfil oferece exportação, restauração e limpeza dos dados locais, sempre com confirmação.

No Estúdio da matéria, a aba Vídeo aula também recomenda buscas de aulas em vídeo. A IA transforma a
matéria, os subtemas e as preferências do estudante em cards com consulta sugerida, foco didático e
critérios para escolher uma boa aula. O backend não usa a YouTube Data API.

Cada recomendação pode receber feedback, ser salva na trilha da matéria e aparecer na aba Plano. Quando
existe um simulado concluído, os subtemas com pior desempenho entram automaticamente na próxima recomendação.

O modo de documentos é uma captura sequencial local; ele ainda não faz correção geométrica automática,
detecção de bordas ou sincronização em nuvem.

## IA

O fluxo real usa um provedor de IA plugável atrás de uma camada de serviço em `../api/_lib/ai/` (o backend
fica na raiz do repositório, compartilhado com o app React Native). O navegador nunca recebe nenhuma
chave: a imagem passa por `POST /api/analyze-image`, que valida o payload, aplica timeout e normaliza a
resposta para o contrato educacional do produto — esse contrato é o mesmo não importa qual provedor esteja
ativo. Veja o [README na raiz](../README.md#ia) para a lista de provedores e variáveis.

Para uma apresentação sem dependência de rede, ative o Demo Mode. O mock fica separado em
`shared/demoResponses.js` e reproduz análise, explicação, resolução, pergunta, quiz e flashcards.

Capturas comuns continuam sendo apenas fotos na galeria. Ao abrir uma captura, a imagem ocupa o
visualizador e oferece três ações independentes: copiar o texto lido, pesquisar o texto no Google ou
escolher "Usar IA" para iniciar uma sessão de estudo. Algumas referências de exemplo estão marcadas como
biblioteca e não entram na análise educacional.

## Conta e Perfil (demo)

O fluxo do perfil é propositalmente local para a apresentação: "Entrar como estudante" cria uma conta
fictícia no `localStorage`, e "Ativar acesso Copilot · Demo" libera um plano demonstrativo. Nenhuma conta
externa, assinatura ou cobrança é realizada.

O acesso demonstrativo ao Copilot fica concentrado no Perfil, junto das preferências do aluno. A rota
antiga `/copilot` continua redirecionando para `/profile`, mas não existe mais uma tela separada de
Copilot nesta versão.

## Rodar localmente

A partir desta pasta (`web/`):

```bash
npm install
npm run dev
```

O comando inicia o frontend Vite em `http://127.0.0.1:5173` e a API local Node em `http://127.0.0.1:8787`
(a mesma API usada pelo app React Native — o código dela vive em `../api/` e `../server/`, na raiz do
repositório). O frontend encaminha `/api/analyze-image` (e demais rotas) para essa API local. Para abrir a
galeria, use `http://127.0.0.1:5173/gallery`; a API também redireciona `http://127.0.0.1:8787/gallery`
para essa tela por conveniência.

As variáveis de ambiente (`.env`) ficam na raiz do repositório, compartilhadas com o backend e com o app
React Native — veja o [README na raiz](../README.md#variáveis-locais). O `vite.config.js` deste projeto
está configurado (`envDir: '../'`) para ler esse `.env` da raiz.

## Produção

```bash
npm run build
```

O build gera os arquivos estáticos em `web/dist/`. Em desenvolvimento, `scripts/dev.js` coordena o Vite
(a partir desta pasta) e `../server/local-api.js` (na raiz); em produção, hospede o frontend e essa API
Node no ambiente local ou em um servidor sob seu controle.

**Esta pasta não compila sozinha.** O build importa de `../shared/` (lógica que o app nativo e o
backend também usam) e o Vite lê o `.env` da raiz via `envDir: '../'`. Num build isolado, só com o
conteúdo de `web/`, o Rollup falha com sete `UNRESOLVED_IMPORT` — verificado. Ou seja: o diretório
raiz do build tem de ser a **raiz do repositório**, não `web/`. Em plataformas como a Vercel isso é a
configuração "Root Directory"; `api/` tem a mesma exigência, porque os handlers importam de
`../../../../shared/`.
