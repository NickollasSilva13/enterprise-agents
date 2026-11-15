# CLAUDE.md — Instruções permanentes para o Claude Code

## Contexto

Plataforma **local** de gerenciamento e orquestração de agentes de IA, de usuário único, com interface web. Inspirada visualmente no Habblaude, mas com código, arte e marca próprios. Nome de trabalho: Enterprise Agents.

Documentos de referência, sempre mais detalhados que este:
`SPEC.md` (o quê), `ARCHITECTURE.md` (como), `SECURITY.md` (controles), `TESTING.md` (testes), `ROADMAP.md` (fases).

## Regras de processo (obrigatórias)

0. **São onze fases** (uma "Escritório vivo" foi inserida como Fase 9; segurança e qualidade é a 10, finalização é a 11). A fonte da numeração é `ROADMAP.md`.
1. **Desenvolvimento por fases.** Trabalhe apenas na fase em curso segundo `ROADMAP.md`. Não adiante itens de fases futuras.
2. **Parada entre fases.** Ao concluir uma fase, apresente: o que foi feito; arquivos criados ou modificados; decisões técnicas; testes executados e resultados; problemas e pendências; resumo; o que vem na próxima fase. Depois pergunte explicitamente se pode prosseguir e **aguarde**.
3. **Decisão arquitetural não coberta:** apresente alternativas e peça aprovação antes de implementar.
4. **Resultados de teste nunca são inventados.** Relate só o que foi executado, com a saída real.
5. **Nada fictício na interface.** Todo elemento funciona ou está marcado como "planejado para a Fase N". Sem dados de exemplo fixos no código.
6. **Documentação viva.** Ao fim de cada fase, atualize `ROADMAP.md`, a seção 9 de `SECURITY.md`, a seção 7 de `TESTING.md` e o que mais tiver mudado.
7. **Sem alterações desnecessárias.** Não refatore nem reformate o que não faz parte da tarefa.

## Arquitetura em resumo

Monólito modular: um processo Node (Fastify) serve a API e a interface compilada; SQLite local; SSE para eventos em tempo real.

Regra de dependência no servidor: `http → modules → runtime → providers | tools`. Camadas internas não importam as externas. `packages/shared` não importa nada de `apps/`.

Peças centrais: `ModelProvider` (interface de provedores), `ToolRegistry`, `PermissionEngine`, `EventBus`, `SecretStore`. Execuções formam uma árvore (`runs.parent_run_id`); delegação entre agentes é uma ferramenta.

## Estrutura de diretórios

```
apps/server/src/{config,core,db,http,security,modules,runtime,providers,tools}
apps/server/drizzle/   # migrações geradas; nunca editar à mão
apps/server/test/      # testes de integração e helpers
apps/web/src/{app,components,features,lib}
apps/web/e2e/
packages/shared/src/
data/                  # não versionado
```

`core/errors.ts` tem as classes de erro que qualquer camada pode lançar; só `http/error-handler.ts` as converte em resposta.

Cada domínio em `modules/<nome>/` tem `routes.ts`, `service.ts`, `repository.ts` e testes ao lado.

Fatos da fundação que não são óbvios pelo código:

- Não há etapa de compilação do servidor: ele roda com `tsx` também em `npm start`. `tsc` é usado só para checar tipos.
- `@ea/shared` é consumido direto do código-fonte TypeScript (sem build).
- Importações relativas sem extensão (`moduleResolution: Bundler`).
- `buildApp()` não escuta em porta; os testes usam `app.inject()` e o helper `makeApp()` de `apps/server/test/helpers.ts`, que já fornece os cabeçalhos de uma requisição legítima.
- Toda rota nova em `/api` já nasce protegida por Host, Origin, Sec-Fetch-Site e sessão. Não crie rotas de API fora do prefixo `/api`.
- As guardas decidem se a requisição é de API pela rota casada (`guardedPath` em `http/app.ts`), nunca por `request.url`: o roteador decodifica escapes (`/%61pi/x` é `/api/x`). Qualquer checagem nova por caminho deve usar `guardedPath`.
- A CSP proíbe estilos e scripts inline: na interface, nunca use o atributo `style` nem carregue recursos de outro domínio. Use classes Tailwind e os tokens de `apps/web/src/app/theme.css`.
- Testes de componente usam `renderApp()` de `apps/web/src/test/render.tsx`, que monta as rotas reais sobre uma API simulada.
- Limites e padrões dos campos de agente e projeto vivem só em `packages/shared/src/agents.ts` (`AGENT_LIMITS`, `AGENT_DEFAULTS`); servidor, formulário e textos de ajuda leem de lá.
- Mensagens de validação são em português: o zod é configurado com o locale `ptBR` em `packages/shared/src/index.ts`, e os campos visíveis ao usuário têm mensagem própria.
- Esquemas de entrada são `z.strictObject`: campo desconhecido é erro.
- Agente excluído tem `deleted_at` preenchido e some de toda listagem; use `listAgentsWithState`/`listAgents`, nunca leia a tabela `agents` sem filtrar.
- Adaptadores de provedor lançam só `ProviderError` e nunca colocam texto do provedor na mensagem; quem loga usa `redactSecrets` com a chave conhecida.
- Testes de adaptador usam servidores HTTP reais de `apps/server/test/stub-servers.ts`. Ao mexer em um adaptador, valide também contra o Ollama local se ele estiver instalado.
- O adaptador da Anthropic usa o SDK oficial e sempre passa a chave explicitamente: sem chave o SDK usaria credenciais da própria máquina.
- Nos testes, o cofre é `MemorySecretStore` (exposto como `secrets` por `makeApp()`); o cofre real só é tocado por um teste que usa um nome de serviço próprio.
- A auditoria se grava com `recordAudit()`; a tabela recusa `UPDATE` e `DELETE`.
- Migração com SQL escrito à mão (gatilhos, por exemplo): `npx drizzle-kit generate --custom --name <nome>` em `apps/server`, depois preencher o arquivo gerado.
- Dados de teste no servidor: construtores em `apps/server/test/fixtures.ts`.
- Use sempre `newId()` para ids; consultas assumem que o maior id é o mais recente.
- O runtime (`runtime/`) não importa `db` nem `modules`: o que executar chega por `RunPlan` e o que aconteceu sai por `RunStore` e pelo `EventBus`. A ligação com o banco fica em `modules/runs` (`createRunsContext`).
- Todo passo de execução é emitido com `bus.emitStep()`, que grava antes de distribuir. Nunca insira em `run_steps` por fora (exceção: a recuperação na inicialização).
- Mensagens de erro de execução gravadas no banco são frases fixas e seguras; o detalhe do provedor só vai ao log, com `redactSecrets`.
- Respostas SSE usam `SseHub` (`http/sse.ts`): ele repassa os cabeçalhos de segurança e fecha os fluxos no desligamento. Não escreva em `reply.raw` por fora.
- Ao iniciar, o servidor marca como `interrupted` toda execução ativa que encontrar. Em testes, insira execuções "em andamento" depois de `makeApp()`, ou elas serão interrompidas.
- Testes de runtime e de API usam o `FakeProvider` em processo (`apps/server/test/fake-provider.ts`), passado por `makeApp({ createProvider })`.
- Saída de modelo na interface só pelo componente `Markdown`. Não habilite HTML bruto nem imagens nele.
- Nos desenhos SVG do Escritório, não use `<text>` (o texto entra no conteúdo lido da mesa) nem o atributo `style`; uma classe de animação nunca vai no mesmo elemento que tem `transform`.
- Testes de componente que precisam de eventos do servidor usam `installFakeEventSource()` (`apps/web/src/test/fake-event-source.ts`); sem ele, `EventSource` não existe no jsdom e as telas caem na consulta periódica.
- Em `renderApp()`, uma requisição com query string também casa com a entrada do caminho sem ela.
- O provedor simulado do E2E responde conforme uma palavra na mensagem: `devagar` (resposta longa, para testar streaming e interrupção) e `perigo` (resposta com HTML hostil).
- Não deixe servidores rodando em segundo plano após testar: `tsx watch` reinicia sozinho e ocupa a porta 4317. Antes de rodar E2E, as portas 4391 a 4395 precisam estar livres.
- Testes E2E que alteram dados usam o servidor `CRUD_URL` (porta 4393) e colocam o nome do projeto do Playwright nos nomes que criam, porque desktop e celular compartilham o banco.
- Playwright fica em `workers: 2` e com espera de 20 s nas verificações de propósito (ver `TESTING.md`, seção 8).
- O único caminho do pedido do modelo até uma ferramenta é `RunManager.dispatch` (`runtime/run-manager.ts`): decisão do `PermissionEngine`, validação Zod, aprovação se `ask`, execução. Ferramenta nova entra em `tools/builtin/` e em `createBuiltinRegistry()`; nunca chame `execute` por fora.
- Ferramentas recebem só `ToolContext` (pasta do agente, sinal, delegar). Caminho vindo do modelo passa sempre por `resolveInWorkspace`; endereço vindo do modelo, por `fetchPublicUrl`.
- `makeApp()` cria um `DATA_DIR` temporário (`dataDir`): as pastas de trabalho dos testes ficam lá, nunca em `data/`.
- Permissões em teste: `grantTools()` de `test/fixtures.ts`; modelo que aceita ferramentas: `addModel(db, provider, nome, { supportsTools: true })`; o `FakeProvider` pede ferramentas com `toolCalls` no roteiro.
- Os passos de ferramenta levam `toolTitle` no payload; a interface não tem cópia do catálogo.
- O provedor simulado do E2E pede ferramentas com as palavras `anote` (escrever arquivo) e `delegue a "<agente>"`; `tools.spec.ts` usa um servidor só dele (`TOOLS_URL`, porta 4395).
- Escritório vivo: o lugar de cada agente é decidido só por `placeOf` (`features/office/scene.ts`) a partir de `/api/office`; não guarde posição em lugar nenhum. O motor (`SceneEngine`) não toca o DOM e se testa como função pura; os personagens se movem pelo atributo `transform`, nunca por `style`.
- Testes do Escritório leem `data-place` e `data-seated` (na mesa) e `data-walker`/`data-moving` (no personagem). `delegue devagar a "<agente>"` no provedor simulado cria uma delegação longa. `office.spec.ts` prepara dados pela API a partir da página e espera 2 s antes de pedir nova leitura (`staleTime`).
- Exportar e importar agentes: `modules/agents/transfer.ts`. O arquivo nomeia projeto, modelo e provedor (nunca ids, endereço ou chave) e a importação nunca grava `allow`: tudo entra como `ask`. Campo novo de agente precisa entrar em `exportedAgentSchema` e nos dois sentidos de `transfer.ts`.
- Em E2E, prepare dados com `api()` de `e2e/helpers.ts` (refaz a sessão em 401). Os arquivos de `e2e/` não têm os tipos do Node: nada de `node:fs` nem `Buffer` neles.
- `Panel` rotula a própria região com o título: em testes, `getByRole('region', { name: título })`.
- No PowerShell 5.1, `Set-Content -Encoding utf8` grava BOM. Use as ferramentas de edição, não redirecionamento de shell, para alterar arquivos.

## Padrões de código

- TypeScript estrito. Sem `any`; use `unknown` e valide.
- Validação com Zod em toda borda: requisições HTTP, variáveis de ambiente, argumentos de ferramentas, respostas de provedores.
- Os esquemas da API vivem em `packages/shared` e são a única fonte dos tipos de contrato.
- Erros: classes de erro de domínio convertidas pela camada HTTP para `{ code, message, details }`. Nunca vaze stack trace ou mensagem bruta de provedor para o cliente.
- Funções pequenas, sem estado global. Dependências injetadas por parâmetro (facilita teste).
- Acesso ao banco só nos repositórios.
- Comentários explicam o porquê, não o quê.
- Sem dependência nova sem necessidade clara; prefira a biblioteca padrão do Node.

## Convenções de nomenclatura

| Item | Convenção |
|---|---|
| Código, identificadores, tabelas, commits | Inglês |
| Textos da interface e documentação | Português |
| Arquivos TypeScript | `kebab-case.ts` |
| Componentes React | `PascalCase.tsx` |
| Tipos e classes | `PascalCase` |
| Funções e variáveis | `camelCase` |
| Tabelas e colunas | `snake_case` |
| Rotas | `/api/<recurso-no-plural>` |
| Testes | `<arquivo>.test.ts` ao lado do código; E2E em `*.spec.ts` |

## Comandos

| Comando | Uso |
|---|---|
| `npm install` | Instalar dependências. |
| `npm run dev` | Servidor (4317) e interface (5173) com recarga. |
| `npm start` | Compilar a interface e iniciar em `http://127.0.0.1:4317`. |
| `npm run check` | `typecheck` + `lint` + `test`. Rodar antes de encerrar qualquer tarefa. |
| `npm test` | Unitários, integração, componentes. |
| `npm run format` | Formatar com Prettier (o lint falha se houver arquivo fora do padrão). |
| `npm test -w @ea/server -- test/db.test.ts` | Rodar um único arquivo de teste. |
| `npm run test:e2e` | Compila a interface e roda o Playwright (desktop e celular). |
| `npm run test:e2e -w @ea/web -- -g "texto"` | Rodar testes E2E pelo nome (exige `npm run build` antes). |
| `npm run test:coverage` | Testes do servidor com cobertura; falha abaixo das metas de `TESTING.md`. |
| `npm run test:perf` | Desempenho da API sobre um banco volumoso; falha acima dos limites. |
| `npm run db:generate` | Gerar migração a partir do esquema. |
| `npm run db:migrate` | Aplicar migrações. |

Ambiente: Windows 11, PowerShell. Use caminhos e comandos compatíveis.

## Regras de segurança para alterações

Estas regras não admitem atalho:

- O servidor escuta apenas em `127.0.0.1`. Não adicione opção para mudar isso.
- Credenciais só passam pelo `SecretStore`. Nunca no banco, em logs, em respostas de API, no `.env` ou no contexto enviado ao modelo.
- Toda chamada de ferramenta passa pelo `PermissionEngine`. Não crie caminho alternativo.
- Segurança nunca depende de instrução no prompt.
- Acesso a arquivos por agentes usa exclusivamente o resolvedor de caminhos confinado à pasta de trabalho.
- Processos são criados sem shell, com argumentos em lista.
- Saída de modelo e de ferramenta é dado não confiável: sanitizar ao renderizar, nunca interpretar como comando.
- Novo controle ou mudança em controle existente exige teste e atualização de `SECURITY.md`.

## Manutenção

- Mudança de esquema: altere o esquema Drizzle, gere a migração, nunca edite migração já aplicada.
- Novo provedor: novo adaptador de `ModelProvider` com testes de contrato compartilhados.
- Nova ferramenta: `ToolDefinition` com esquema Zod, nível de risco e testes de permissão.
- Defeito corrigido: adicione um teste que o reproduza.
- Não versionar `data/`, `.env` nem bancos.
