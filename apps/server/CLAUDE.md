# apps/server — fatos para o Claude Code

Carregado quando a tarefa toca arquivos do servidor. As regras gerais estão em `CLAUDE.md` na raiz.

## Camadas

`http → modules → runtime → providers | tools`. Camada interna não importa a externa.

- `core/errors.ts` tem as classes de erro que qualquer camada pode lançar; só `http/error-handler.ts` as converte em resposta.
- Cada domínio em `modules/<nome>/` tem `routes.ts`, `service.ts`, `repository.ts` e testes ao lado.
- Acesso ao banco só nos repositórios.

## HTTP e segurança da borda

- `buildApp()` não escuta em porta; os testes usam `app.inject()` e o helper `makeApp()` de `test/helpers.ts`, que já fornece os cabeçalhos de uma requisição legítima.
- Toda rota nova em `/api` já nasce protegida por Host, Origin, Sec-Fetch-Site e sessão. Não crie rotas de API fora do prefixo `/api`.
- As guardas decidem se a requisição é de API pela rota casada (`guardedPath` em `http/app.ts`), nunca por `request.url`: o roteador decodifica escapes (`/%61pi/x` é `/api/x`). Qualquer checagem nova por caminho deve usar `guardedPath`.
- Respostas SSE usam `SseHub` (`http/sse.ts`): ele repassa os cabeçalhos de segurança e fecha os fluxos no desligamento. Não escreva em `reply.raw` por fora.

## Banco e dados

- `drizzle/` tem migrações geradas; nunca editar à mão, e nunca editar migração já aplicada.
- Migração com SQL escrito à mão (gatilhos, por exemplo): `npx drizzle-kit generate --custom --name <nome>` nesta pasta, depois preencher o arquivo gerado.
- Agente excluído tem `deleted_at` preenchido e some de toda listagem; use `listAgentsWithState`/`listAgents`, nunca leia a tabela `agents` sem filtrar.
- A auditoria se grava com `recordAudit()`; a tabela recusa `UPDATE` e `DELETE`.

## Provedores

- Adaptadores lançam só `ProviderError` e nunca colocam texto do provedor na mensagem; quem loga usa `redactSecrets` com a chave conhecida.
- Testes de adaptador usam servidores HTTP reais de `test/stub-servers.ts`. Ao mexer em um adaptador, valide também contra o Ollama local se ele estiver instalado.
- O adaptador da Anthropic usa o SDK oficial e sempre passa a chave explicitamente: sem chave o SDK usaria credenciais da própria máquina.
- Novo provedor: novo adaptador de `ModelProvider` com os testes de contrato compartilhados.

## Runtime

- O runtime (`runtime/`) não importa `db` nem `modules`: o que executar chega por `RunPlan` e o que aconteceu sai por `RunStore` e pelo `EventBus`. A ligação com o banco fica em `modules/runs` (`createRunsContext`).
- Todo passo de execução é emitido com `bus.emitStep()`, que grava antes de distribuir. Nunca insira em `run_steps` por fora (exceção: a recuperação na inicialização).
- Mensagens de erro de execução gravadas no banco são frases fixas e seguras; o detalhe do provedor só vai ao log, com `redactSecrets`.
- Ao iniciar, o servidor marca como `interrupted` toda execução ativa que encontrar.

## Ferramentas

- O único caminho do pedido do modelo até uma ferramenta é `RunManager.dispatch` (`runtime/run-manager.ts`): decisão do `PermissionEngine`, validação Zod, aprovação se `ask`, execução. Ferramenta nova entra em `tools/builtin/` e em `createBuiltinRegistry()`; nunca chame `execute` por fora.
- Ferramentas recebem só `ToolContext` (pasta do agente, sinal, delegar). Caminho vindo do modelo passa sempre por `resolveInWorkspace`; endereço vindo do modelo, por `fetchPublicUrl`.
- Nova ferramenta: `ToolDefinition` com esquema Zod, nível de risco e testes de permissão.

## Exportar e importar agentes

`modules/agents/transfer.ts`. O arquivo nomeia projeto, modelo e provedor (nunca ids, endereço ou chave) e a importação nunca grava `allow`: tudo entra como `ask`. Campo novo de agente precisa entrar em `exportedAgentSchema` e nos dois sentidos de `transfer.ts`.

## Testes

- Dados de teste: construtores em `test/fixtures.ts`.
- Nos testes, o cofre é `MemorySecretStore` (exposto como `secrets` por `makeApp()`); o cofre real só é tocado por um teste que usa um nome de serviço próprio.
- Testes de runtime e de API usam o `FakeProvider` em processo (`test/fake-provider.ts`), passado por `makeApp({ createProvider })`.
- `makeApp()` cria um `DATA_DIR` temporário (`dataDir`): as pastas de trabalho dos testes ficam lá, nunca em `data/`.
- Insira execuções "em andamento" depois de `makeApp()`, ou elas serão interrompidas na inicialização.
- Permissões em teste: `grantTools()` de `test/fixtures.ts`; modelo que aceita ferramentas: `addModel(db, provider, nome, { supportsTools: true })`; o `FakeProvider` pede ferramentas com `toolCalls` no roteiro.
- Arquivo único: `npm test -w @ea/server -- test/db.test.ts`.
