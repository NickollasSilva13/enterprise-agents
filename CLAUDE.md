# CLAUDE.md — Instruções permanentes para o Claude Code

## Contexto

Plataforma **local** de gerenciamento e orquestração de agentes de IA, de usuário único, com interface web. Inspirada visualmente no Habblaude, mas com código, arte e marca próprios. Nome de trabalho: Enterprise Agents.

Documentos de referência, sempre mais detalhados que este:
`SPEC.md` (o quê), `ARCHITECTURE.md` (como), `SECURITY.md` (controles), `TESTING.md` (testes), `ROADMAP.md` (fases).

## Regras de processo (obrigatórias)

0. **São trinta e nove fases concluídas** (uma "Escritório vivo" foi inserida como Fase 9; segurança e qualidade é a 10, finalização é a 11; a 12 e a 13 trazem o harness local como provedor, com as ferramentas da plataforma; a 14 é o Escritório isométrico personalizável e a 15, os personagens 16 bits e o entorno; a 16, a 17 e a 18 transformam a plataforma numa empresa de agentes, com áreas, quadro de tarefas e fluxos configuráveis; a 19 traz o agendamento de tarefas; da 20 à 32, a nova interface, começando pelo sistema visual, pela moldura, pelos personagens 32 bits e pelo prédio; da 24 à 28, o Escritório em 3D; a 33 traz os ambientes externos em 3D, começando pelo parque, a 34 põe a cidade na mesma arquitetura, a 35 traz o bairro residencial e o condomínio moderno, a 36 a ilha tropical e o jardim tecnológico, a 37 foi a validação final, a 38, o redesenho da interface, e a 39 trouxe as equipes por modelo e o fluxo em desenho). A fonte da numeração é `ROADMAP.md`.
1. **Desenvolvimento por fases.** Trabalhe apenas na fase em curso segundo `ROADMAP.md`. Não adiante itens de fases futuras.
2. **Parada entre fases.** Ao concluir uma fase, apresente: o que foi feito; arquivos criados ou modificados; decisões técnicas; testes executados e resultados; problemas e pendências; resumo; o que vem na próxima fase. Depois pergunte explicitamente se pode prosseguir e **aguarde**.
3. **Decisão arquitetural não coberta:** apresente alternativas e peça aprovação antes de implementar.
4. **Resultados de teste nunca são inventados.** Relate só o que foi executado, com a saída real.
5. **Nada fictício na interface.** Todo elemento funciona ou está marcado como "planejado para a Fase N". Sem dados de exemplo fixos no código.
6. **Documentação viva.** Ao fim de cada fase, atualize `ROADMAP.md`, a seção 9 de `SECURITY.md`, a seção 7 de `TESTING.md` e o que mais tiver mudado.
7. **Sem alterações desnecessárias.** Não refatore nem reformate o que não faz parte da tarefa.
8. **Leitura de código com escopo.** Ao analisar, buscar ou revisar o código, leia apenas o que é do projeto: `apps/`, `packages/`, `docs/`, os arquivos de configuração da raiz e os documentos `.md`. Nunca percorra nem leia:
   - `node_modules/` (e qualquer `node_modules` aninhado), `.git/`;
   - `dist/`, `coverage/`, `.vite/`, `playwright-report/`, `test-results/`, `.e2e-data/`;
   - `data/`, `*.db`, `*.db-shm`, `*.db-wal`, `*.log`, `package-lock.json`;
   - `apps/server/drizzle/meta/`.

   Busca em conteúdo é sempre com Grep (que respeita o `.gitignore`), nunca lendo arquivos em massa. Para saber a versão ou a API de uma dependência, leia `package.json`; só abra um arquivo dentro de `node_modules/` se for a única forma de responder, e nesse caso apenas o arquivo exato (por exemplo um `.d.ts` específico). Esses diretórios são grandes e gastam contexto sem valor.

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

**Memória por área.** Os fatos detalhados de cada parte ficam em `apps/server/CLAUDE.md`, `apps/web/CLAUDE.md` e `apps/web/e2e/CLAUDE.md`, carregados automaticamente quando a tarefa toca aquela pasta. Não repita esses fatos aqui: fato novo de servidor, de interface ou de E2E entra no arquivo da área, e só o que vale para o repositório inteiro entra neste.

Fatos da fundação que valem para todo o repositório e não são óbvios pelo código:

- Não há etapa de compilação do servidor: ele roda com `tsx` também em `npm start`. `tsc` é usado só para checar tipos.
- `@ea/shared` é consumido direto do código-fonte TypeScript (sem build).
- Importações relativas sem extensão (`moduleResolution: Bundler`).
- Limites e padrões dos campos de agente e projeto vivem só em `packages/shared/src/agents.ts` (`AGENT_LIMITS`, `AGENT_DEFAULTS`); servidor, formulário e textos de ajuda leem de lá.
- Mensagens de validação são em português: o zod é configurado com o locale `ptBR` em `packages/shared/src/index.ts`, e os campos visíveis ao usuário têm mensagem própria.
- Esquemas de entrada são `z.strictObject`: campo desconhecido é erro.
- Use sempre `newId()` para ids; consultas assumem que o maior id é o mais recente.
- Não deixe servidores rodando em segundo plano após testar: `tsx watch` reinicia sozinho e ocupa a porta 4317.
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
| Código, identificadores, tabelas | Inglês |
| Textos da interface, documentação e mensagens de commit | Português |
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
| `npm run check:full` | `check` + cobertura + ponta a ponta. Rodar antes de encerrar uma fase. |
| `npm run clean` | Apagar `dist/`, `coverage/`, `test-results/` e `.e2e-data/`. Não toca em `data/`. |
| `npm test` | Unitários, integração, componentes. |
| `npm run format` | Formatar com Prettier (o lint falha se houver arquivo fora do padrão). |
| `npm test -w @ea/server -- test/db.test.ts` | Rodar um único arquivo de teste. |
| `npm run test:e2e` | Compila a interface e roda o Playwright (desktop e celular). |
| `npm run test:e2e -w @ea/web -- -g "texto"` | Rodar testes E2E pelo nome (exige `npm run build:e2e -w @ea/web` antes). |
| `npm run test:coverage` | Testes do servidor com cobertura; falha abaixo das metas de `TESTING.md`. |
| `npm run test:perf` | Desempenho da API sobre um banco volumoso; falha acima dos limites. |
| `npm run db:generate` | Gerar migração a partir do esquema. |
| `npm run db:migrate` | Aplicar migrações. |

Ambiente: Windows 11, PowerShell. Use caminhos e comandos compatíveis.

## Ferramental do Claude Code (`.claude/`, versionado)

| Caminho | O que é |
|---|---|
| `settings.json` | Permissões (comandos de leitura liberados; leitura negada em `node_modules/`, `dist/`, `data/`, `.e2e-data/`, `.env` e bancos) e os hooks abaixo. |
| `hooks/format-fix.mjs` | Depois de escrever um arquivo: Prettier e `eslint --fix` nele. |
| `hooks/guard-migrations.mjs` | Antes de escrever: recusa editar migração que já tem SQL e qualquer coisa em `drizzle/meta/`. |
| `hooks/remind-check.mjs` | Ao encerrar o turno com código alterado: lembra de rodar `npm run check`. |
| `commands/` | `/encerrar-fase`, `/nova-ferramenta`, `/novo-provedor`, `/nova-migracao`. |
| `agents/` | `revisor-seguranca` (revisa contra o `SECURITY.md`, só lê) e `explorador` (busca ampla sem gastar contexto). |
| `launch.json` | Pré-visualização: `enterprise-agents-dev` (5173, com recarga) e `enterprise-agents` (4317, compilado). |

Ajuste pessoal que não deve ser versionado vai em `.claude/settings.local.json`, que está no `.gitignore`.

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
