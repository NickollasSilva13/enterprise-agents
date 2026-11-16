# ROADMAP — Controle das fases

Regra do projeto: ao fim de cada fase o trabalho para, é apresentado um relatório e a fase seguinte só começa com autorização explícita.

## Situação

| Fase | Nome | Estado |
|---|---|---|
| 1 | Descoberta e planejamento | Concluída em 2026-11-12 |
| 2 | Especificação e documentação | Concluída em 2026-11-12 |
| 3 | Fundação do projeto | Concluída em 2026-11-12 |
| 4 | Interface e dashboard | Concluída em 2026-11-12 |
| 5 | Gerenciamento de agentes | Concluída em 2026-11-12 |
| 6 | Integração com modelos de IA | Concluída em 2026-11-12 |
| 7 | Execução e interação | Concluída em 2026-11-13 |
| 8 | Orquestração e ferramentas | Concluída em 2026-11-13 |
| 9 | Escritório vivo | Concluída em 2026-11-14 |
| 10 | Segurança e qualidade | Concluída em 2026-11-14 |
| 11 | Finalização e documentação | Concluída em 2026-11-15 |
| 12 | Harness local como provedor | Concluída em 2026-11-15 |
| 13 | Ferramentas da plataforma para agentes de harness | Concluída em 2026-11-15 |
| 14 | Escritório isométrico personalizável | Concluída em 2026-11-16 |
| 15 | Personagens 16 bits e entorno do escritório | Concluída em 2026-11-16 |
| 16 | Áreas, quadro de tarefas e fluxos configuráveis | Concluída em 2026-11-16 (aguardando aprovação) |
| 17 | Pedidos entre áreas | Proposta (aguardando aprovação) |
| 18 | Catálogo de fluxos prontos | Proposta (aguardando aprovação) |

## Fases concluídas

### Fase 1 — Descoberta e planejamento
- Análise da página pública da aplicação de referência (a área logada não foi acessada).
- Levantamento de requisitos, proposta de arquitetura, stack e estratégia de segurança.
- Decisões D1 a D5 aprovadas (ver `SPEC.md`, seção 2).

### Fase 2 — Especificação e documentação
- Criados `SPEC.md`, `ARCHITECTURE.md`, `SECURITY.md`, `TESTING.md`, `ROADMAP.md`, `README.md`, `CLAUDE.md`.

### Fase 3 — Fundação do projeto
- Repositório git, monorepo npm workspaces (`apps/server`, `apps/web`, `packages/shared`).
- TypeScript estrito, ESLint, Prettier, Vitest.
- Configuração por ambiente validada na inicialização (`.env.example`).
- Servidor Fastify em `127.0.0.1`, formato único de erro, rota `/api/health`.
- SQLite com o esquema inicial completo (13 tabelas) e migração gerada.
- Controles C-01 a C-04, C-06 e C-24, com testes.
- Página provisória que mostra o estado real do servidor e do banco.
- `npm run dev`, `npm start`, `npm run check`, `npm run db:generate`, `npm run db:migrate`.
- Pendências: encerramento por `Ctrl+C` não verificado em terminal interativo; nenhum commit foi feito.

### Fase 4 — Interface e dashboard
- Identidade visual própria (planta de escritório: azul-tinta, linhas claras, cor só para estado) com Tailwind e fonte embutida.
- Componentes base: botão, painel, quadro de indicadores, tabela, estados de carregamento, vazio e erro, avatar e lâmpada de estado do agente.
- Layout responsivo: barra lateral no desktop, menu deslizante no celular, faixa de resumo sempre visível.
- Painel ligado à API real: contagens por estado (RF-01), execuções, indicadores de 24 h, execuções recentes e alertas.
- Escritório: uma sala por projeto e uma mesa por agente, com o estado de cada um (RF-07, atualização por consulta a cada 5 s).
- Configurações: dados reais da instalação.
- Agentes, Modelos, Ferramentas, Aprovações e Logs aparecem como áreas planejadas, com a fase de entrega.
- API: `/api/dashboard/summary`, `/api/office`, `/api/system/info`.
- Controle C-05 (CSP e cabeçalhos de segurança). Testes E2E com Playwright em desktop e celular.
- Ficou para a Fase 5: componente de modal (não havia uso real nesta fase).
- Pendência: instabilidade de testes E2E com muitos navegadores em paralelo nesta máquina (ver `TESTING.md`, seção 8).

### Fase 5 — Gerenciamento de agentes
- API de agentes: listar, obter, criar, editar, duplicar, ativar/desativar e excluir (`/api/agents`).
- API de projetos (`/api/projects`) e leitura dos modelos disponíveis (`/api/models`, vazia até a Fase 6).
- Tela de agentes: lista com busca e filtro por estado, chave de ativação, duplicar e excluir com confirmação.
- Formulário de agente: identidade, prompt de sistema, modelo, parâmetros e limites, validado com o mesmo esquema do servidor.
- Projetos: criar, renomear, descrever e excluir na própria tela de agentes.
- Componentes novos: campos de formulário, chave liga/desliga, modal, confirmação e avisos temporários.
- Regras: nome único entre agentes ativos; exclusão lógica que preserva o histórico (RN-07); exclusão recusada com execução em andamento; projeto ou modelo inexistente recusado.
- Mensagens de validação em português, vindas do esquema compartilhado.
- RN-01 (agente inativo não executa) está representada no estado, mas só passa a ser exercida na Fase 7, quando existir execução.

### Fase 6 — Integração com modelos de IA
- Camada de provedores: interface `ModelProvider` e adaptadores para Ollama, serviços compatíveis com OpenAI e Anthropic (SDK oficial), com conversa em streaming, uso de tokens e cancelamento.
- Erros de provedor com mensagens fixas e seguras; o texto vindo do provedor fica separado e só vai ao log depois de redigido.
- Cofre de credenciais do sistema operacional (`SecretStore`); o banco guarda apenas a referência.
- API: provedores (criar, editar, excluir, testar conexão), modelos (buscar no provedor, habilitar e desabilitar).
- Tela de Modelos: adicionar e editar provedor, teste de conexão, lista de modelos, aviso do que é enviado a provedores externos.
- Trilha de auditoria para provedores, chaves e modelos, protegida contra alteração e exclusão por gatilhos no banco.
- Regras: provedor ou modelo em uso por agente não pode ser removido nem desabilitado (RN-08); modelos chegam desabilitados; agente excluído libera o modelo.
- Validado com o Ollama 0.40.16 real e o modelo `llama3.2:3b`: conexão, listagem, conversa em streaming e cancelamento.
- Ficou para a Fase 7: provedor simulado em processo (`FakeProvider`) para os testes do runtime; nesta fase os testes usam servidores HTTP simulados.
- Ficou para a Fase 8: chamadas de ferramenta nos adaptadores.
- Não validado com serviço real: OpenAI e Anthropic (testados contra servidores simulados que seguem o protocolo).

### Fase 7 — Execução e interação
- Runtime (`apps/server/src/runtime`): fila com limite global de execuções simultâneas, um controlador de cancelamento por execução, limites de tempo, passos e tokens, e encerramento limpo no desligamento. Não lê nem grava o banco: recebe o plano da execução e devolve o resultado por interfaces.
- `EventBus`: cada passo é gravado antes de ser distribuído; o texto do modelo é transmitido ao vivo e gravado como mensagem ao final.
- API: conversas (`/api/conversations`, `/api/agents/:id/conversations`), execuções (`/api/runs`, com filtros e paginação, `/api/runs/:id`, `/api/runs/:id/cancel`) e dois fluxos SSE: `/api/runs/:id/events` (uma execução, com retomada por `Last-Event-ID`) e `/api/events` (aviso de qualquer mudança).
- Chat por agente: resposta em streaming, histórico de conversas, interromper, continuar na mesma conversa, excluir conversa; aviso do que é enviado quando o modelo é externo.
- Saída do modelo exibida como Markdown seguro: sem HTML, sem imagens, links em nova aba.
- Logs: lista de execuções com filtro por agente, estado e período, e a página de cada execução com a linha do tempo dos passos.
- Painel ao vivo: atividade dos agentes em linguagem natural, execuções recentes com link, alerta de provedor inacessível.
- Escritório ilustrado (RF-08), substituindo a planta baixa da Fase 4: salas com parede, janelas e piso; cada agente sentado à sua mesa com computador e um objeto pessoal; animação por estado (digitando, mão levantada, cabeça balançando, respirando, cadeira vazia quando inativo); balão com o que está fazendo; clique abre a conversa. Arte em SVG própria, sem recursos externos.
- Regras: RN-01, RN-02 e RN-06 aplicadas ao enviar a mensagem e de novo quando a execução sai da fila; RN-05 (limites); RN-12 (execuções ativas viram `interrupted` ao iniciar o servidor, e as aprovações pendentes delas são canceladas).
- Controles C-07, C-13 e C-14, com testes.
- `FakeProvider` em processo para os testes do runtime; o provedor simulado dos testes E2E passou a conversar em streaming.
- Validado com o Ollama real (`llama3.2:3b`): conversa com streaming pela interface e interrupção de uma resposta longa.
- Ficou para a Fase 8: o limite de passos só pode ser atingido quando houver ferramentas (hoje toda execução tem uma única chamada ao modelo); a origem "manual" de uma execução ainda não é usada (executar um agente é enviar uma mensagem no chat).
- Pendências: ver `TESTING.md`, seções 7 e 8.

### Fase 8 — Orquestração e ferramentas
- Chamadas de ferramenta nos três adaptadores de provedor (Ollama, compatível com OpenAI, Anthropic).
- `ToolRegistry` (catálogo com esquema Zod e risco) e `PermissionEngine` (única decisão de permissão, consultada a cada chamada; negação por padrão).
- Ferramentas: ler arquivo, listar pasta, escrever arquivo, buscar URL, delegar a agente e executar script (desligada por padrão, só Node.js, sempre com aprovação).
- Pasta de trabalho por agente em `DATA_DIR/workspaces/<id>`, com resolvedor de caminhos confinado.
- Runtime: laço modelo → ferramentas → modelo, limite de passos agora alcançável, pausa para aprovação (o relógio do tempo máximo para enquanto espera), cancelamento que interrompe a ferramenta em curso.
- Aprovações: fila com os argumentos exatos, aprovar ou negar com motivo; pedido retirado se a execução é interrompida (RN-09).
- Delegação: execução filha ligada à de origem, com modelo, limites e permissões do agente que recebe; profundidade máxima (`MAX_DELEGATION_DEPTH`, padrão 3) e recusa de ciclos (RN-10).
- API: `/api/tools`, `/api/agents/:id/tools`, `/api/approvals`, `/api/approvals/:id/decision`; a execução passou a trazer a árvore de delegação.
- Telas: Ferramentas (catálogo e permissões por agente), Aprovações (fila e decisões recentes), cartão de aprovação dentro da conversa e da execução, árvore de delegação nos logs, passos de ferramenta em linguagem natural.
- Escritório (RF-09): botão "Decidir" na mesa de quem espera aprovação; delegação mostrada por uma linha entre as mesas e pelos balões dos dois agentes.
- Modelos de serviços compatíveis com OpenAI podem ser marcados à mão como capazes de usar ferramentas.
- Trilha de auditoria completa (RF-72): permissões alteradas, ferramenta ligada ou desligada, aprovações decididas, delegações e toda execução de ferramenta de risco médio ou alto.
- Controles C-15 a C-23 e a parte de ferramentas de C-11, C-13 e C-14, com testes.
- Validado com o Ollama real (`llama3.2:3b`): escrita de arquivo com aprovação a partir do Escritório e delegação entre dois agentes.
- Não existe mais área "planejada" na navegação.
- Ficou de fora, de propósito: scripts Python (só Node.js, que permite restringir o script à pasta de trabalho); a origem "manual" de execução continua sem uso.
- Pendências: ver `TESTING.md`, seções 7 e 8, e `SECURITY.md`, seção 10.

### Fase 9 — Escritório vivo
Incluída em 2026-11-12 a pedido do usuário.

- Áreas comuns desenhadas: Recepção (porta da rua, balcão) e Copa (geladeira, cafeteira, bebedouro), antes das salas dos projetos; toda área tem uma porta para o corredor que as liga.
- Personagens em pé, com o mesmo rosto do agente, que andam pelo corredor e pelas portas: ocioso há 2 minutos vai à copa e toma café; inativo sai pela porta da rua e fica fora; agente novo ou reativado entra pela recepção e senta.
- Delegação como visita (RF-80): quem delegou caminha até a mesa de quem recebeu a tarefa, espera ao lado e volta com um papel na mão. Substitui a linha tracejada entre as mesas da Fase 8.
- A cadeira fica vazia enquanto o agente está fora da mesa e só é ocupada quando ele chega de volta.
- Onde cada um está também aparece em texto: "Na copa" ou "Na mesa de …" na mesa do agente, e a lista de quem está na copa e fora do escritório nas áreas comuns. A camada dos personagens é só decoração.
- Posição coerente ao recarregar: o lugar de cada agente deriva só do estado que o servidor informa; ao carregar a página todos já aparecem no lugar, sem caminhada.
- Com "reduzir movimento", os agentes mudam de lugar sem caminhada.
- Nenhum dado novo é gravado. A API do Escritório ganhou um campo derivado, `idleSince` (fim da última execução ou última alteração do agente, o que for mais recente).
- Arte original em SVG, sem recursos externos, sem estilo inline e sem `<text>`.
- Medido no E2E com 30 agentes andando ao mesmo tempo: 60 quadros por segundo em desktop e celular (Chromium sem interface, nesta máquina).
- Decisões: 2 minutos de ócio para ir à copa (`PANTRY_AFTER_MS`); nenhuma caminhada dura mais de 7 s (trajetos longos são andados mais rápido); quem espera a sua aprovação ou falhou fica na mesa; uma caminhada em curso termina antes de a seguinte começar.
- Pendências: ver `TESTING.md`, seções 7 e 8.

### Fase 10 — Segurança e qualidade
- Revisão do código do servidor contra cada controle de `SECURITY.md`: camada HTTP, guardas de requisição, sessão, cabeçalhos, redação de segredos, cofre, runtime, `PermissionEngine`, resolvedor de caminhos, guarda de rede, ferramentas, provedores, auditoria; na interface, o componente `Markdown` e uma varredura por HTML bruto, `eval` e armazenamento no navegador.
- **Falha encontrada e corrigida (C-03, C-04):** um caminho de API escrito com escape de URL (`/%61pi/agents`) chegava à rota sem sessão e sem checagem de origem, porque as guardas julgavam o endereço como escrito e o roteador o decodifica antes de casar a rota. As guardas passaram a julgar a rota casada. Detalhes em `SECURITY.md`, seção 10.
- Reforços: o limite de tokens passa a contar uma estimativa quando o provedor não informa o uso (fecha a pendência da Fase 7); uma linha sem fim em resposta de provedor é cortada em 4 MB em vez de ocupar a memória; o log de erro inesperado passa pela redação de segredos.
- Testes de concorrência (`apps/server/test/concurrency.test.ts`): 40 mensagens simultâneas com limite de 3 execuções; 10 mensagens simultâneas na mesma conversa; cancelamentos em dobro; 12 respostas simultâneas à mesma aprovação.
- Desempenho: `npm run test:perf`, sobre 200 agentes, 20.000 execuções, 120.000 passos e 40.000 mensagens, com limite por medição.
- Cobertura: `npm run test:coverage`, que falha se alguma área ficar abaixo da meta de `TESTING.md`. Medido: 97,9% das linhas do servidor.
- `npm audit`: 0 vulnerabilidades no que roda em produção; `npm audit fix` reduziu os avisos de ferramentas de desenvolvimento de 13 para 11, e os restantes estão registrados.
- Dependência nova, só de desenvolvimento: `@vitest/coverage-v8`.
- Ficou de fora: revisão linha a linha da interface além dos pontos citados; validação com modelo real (nada no caminho do modelo mudou além da estimativa de tokens).
- Pendências: ver `SECURITY.md`, seção 10, e `TESTING.md`, seções 7 e 8.

### Fase 11 — Finalização e documentação
- Exportar e importar agentes (RF-20): `GET /api/agents/export` e `POST /api/agents/import`, e os botões Exportar e Importar na tela Agentes.
  - O arquivo JSON leva a configuração do agente e nomeia projeto, modelo e provedor; não leva ids, histórico, endereço de provedor nem chave (RN-11).
  - Importar sempre acrescenta: nome repetido ganha "(importado)"; projeto de mesmo nome é usado e o que falta é criado; modelo só é ligado se existir aqui, habilitado, com o mesmo nome no provedor de mesmo nome.
  - Decisão de segurança: nenhuma ferramenta entra liberada por um arquivo. O que estava "Permitida" entra como "Pede aprovação", e o resultado da importação diz isso agente por agente.
  - Arquivo inválido não importa nada; cada importação fica na auditoria.
- Guia de utilização em `docs/GUIA.md`, em dez tópicos. A lista de tópicos "exigidos" citada neste roteiro não estava em nenhum documento do projeto; os tópicos foram escolhidos para cobrir o uso de ponta a ponta e precisam da confirmação do usuário.
- Validação final com o Ollama real (`llama3.2:3b`), pela interface: conversa, uso de ferramenta, reinício do servidor com o histórico preservado, e exportar e importar.
- Revisão das pendências: o roteiro manual foi refeito, inclusive o item 4 (reinício), que estava sem verificação desde a Fase 7. O que continua aberto está em "Pendências ao final do projeto", abaixo.
- Testes E2E do Escritório tornados mais firmes: a preparação de dados refaz a sessão se receber 401, e o pedido de nova leitura é repetido até a tela mostrar a mudança.

## Fase 12 — Harness local como provedor (concluída)

**Objetivo.** Permitir criar agentes que usam um harness de linha de comando já
instalado e autenticado na máquina do usuário (Claude Code, Codex) em vez de uma
chave de API, para que a plataforma funcione sem custo por token.

**Decisões tomadas com o usuário em 2026-11-15:**

1. O harness entra como **provedor de texto**: o CLI roda em modo não interativo,
   com as ferramentas dele desligadas, e serve apenas de modelo. `RunManager`,
   `PermissionEngine`, aprovações, `run_steps`, delegação, logs e Escritório
   ficam exatamente como estão. Dar ferramentas da plataforma ao harness é a
   Fase 13, não esta.
2. A configuração vai numa coluna nova: migração que torna `base_url` opcional e
   acrescenta `command` (caminho do executável; vazio significa procurar no
   `PATH`). Não se reaproveita `base_url` nem se cria um JSON solto.
3. O adaptador do Codex entra nesta fase atrás do mesmo contrato, com testes
   contra um CLI simulado, e **marcado como não validado com o serviço real** —
   o Codex não está instalado nesta máquina, e resultado de teste não se inventa.

**Escopo.**

- Dois `ProviderKind` novos: `claude_code` e `codex`, com `apiKey: 'none'` (o
  `SecretStore` não é tocado: a credencial é a sessão que o usuário já tem).
- Adaptadores em `apps/server/src/providers/`, implementando `ModelProvider`:
  - `testConnection`: executa o CLI pedindo a versão e devolve o que respondeu.
  - `listModels`: lista fixa por harness (o CLI não publica catálogo), com
    `supportsTools: false` nesta fase.
  - `chat`: um processo por turno, sem shell e com argumentos em lista, traduzindo
    a saída de eventos em JSON do CLI para `ChatEvent` (`text_delta`, `usage`,
    `done`), e matando o processo quando o `AbortSignal` dispara.
- Isolamento obrigatório do processo do harness, como controle de segurança:
  ferramentas próprias desligadas, configuração do usuário neutralizada (para que
  os hooks, permissões e servidores MCP do `~/.claude` dele não entrem na
  execução), e pasta de trabalho igual à pasta do agente.
- Interface: o formulário de provedor mostra campo de comando em vez de endereço
  para esses tipos, sem pedir chave, e deixa claro que o agente de harness ainda
  não usa ferramentas.
- `SECURITY.md`: controle novo para o processo de harness (o que é desligado e
  por quê), e `TESTING.md` para os testes de CLI simulado.

**Fora do escopo.** Ferramentas para agentes de harness, sessões persistentes do
harness, contagem de custo (a assinatura não reporta preço por chamada) e
qualquer harness além desses dois.

**A investigação que abria a fase, respondida.** A chamada de teste a `claude -p`
que voltava com `model: "<synthetic>"` e custo zero herdava 33 variáveis
`CLAUDE*`/`ANTHROPIC*` desta sessão do Claude Desktop (entre elas `CLAUDECODE=1`,
`CLAUDE_CODE_ENTRYPOINT=claude-desktop` e `CLAUDE_CODE_MESSAGING_SOCKET`), e por
isso se comportava como sessão filha do SDK do hospedeiro, sem chamar o modelo.
Com o ambiente limpo (a lista de permissão de C-25), o CLI responde outra coisa:
`Failed to authenticate: OAuth session expired and could not be refreshed`. Ou
seja, o formato de streaming é o documentado, e o que falta é a conta do harness
estar conectada fora do aplicativo. Isso não foi contornado: o adaptador detecta
essa resposta e devolve "o harness não está conectado a uma conta".

**O que foi feito.**

- `claude_code` e `codex` em `PROVIDER_KINDS`, com `transport: 'command'`,
  `apiKey: 'none'` e comando padrão no `PROVIDER_KIND_INFO`; validação própria do
  comando (só o programa, sem argumentos, sem quebra de linha, sem começar por
  `-`) e esquemas que exigem endereço **ou** comando, nunca os dois.
- Migração `0002_providers_command.sql` (escrita à mão, com `drizzle-kit
  generate --custom`): `base_url` passa a aceitar nulo e entra a coluna
  `command`.
- `providers/command.ts`: executor de programas compartilhado, com lista de
  permissão de variáveis de ambiente, argumentos em lista sem shell, pasta de
  trabalho criada se faltar, tempo limite total e de inatividade, cancelamento e
  leitura linha a linha.
- `providers/harness.ts` com o que os dois adaptadores compartilham (transcrição
  da conversa, classificação de erro) e os adaptadores `claude-code.ts` e
  `codex.ts`. Modelos de harness têm `supportsTools: false` e `chat` recusa
  especificação de ferramentas.
- `ProviderError` ganhou `program_missing` e `not_signed_in`, com frases fixas.
- Interface: campo "Comando" em vez de "Endereço", sem chave de API, com aviso
  próprio de provedor externo e a nota de que ferramentas vêm na Fase 13.
- `SECURITY.md`: controle C-25, C-12 estendido e dois problemas conhecidos novos;
  `TESTING.md`: caso obrigatório de C-25 e o registro desta fase.

**Não validado.** O Codex não está instalado nesta máquina: o adaptador foi
escrito pela documentação e testado contra um programa simulado. Uma conversa de
verdade pelo Claude Code também não foi feita, porque a sessão do harness não se
renova fora do aplicativo (ver acima).

## Fase 13 — Ferramentas da plataforma para agentes de harness (concluída)

**Objetivo.** Agentes de harness passam a usar as ferramentas da plataforma
(arquivos, busca de URL, script, delegação), sempre pelas permissões do agente.

**O que mudou no plano.** A ideia inicial era um servidor MCP local da
plataforma. Antes de implementar, um teste com o Claude Code 2.1.301 mostrou que,
com `--safe-mode` ligado, ele não carrega nenhum servidor MCP passado por
`--mcp-config`; sem `--safe-mode`, carrega, mas a leitura automática de
`CLAUDE.md` e a auto-memória do usuário voltam a valer. Com as duas
alternativas apresentadas, **o usuário escolheu em 2026-11-15 manter o laço na
plataforma**: o harness continua só texto, isolado como na Fase 12, e as
ferramentas passam por um protocolo de texto.

**O que foi feito.**

- `providers/harness.ts`: `toolProtocol`/`systemWithTools` descrevem as
  ferramentas concedidas no prompt de sistema; `ToolCallReader` lê, enquanto a
  resposta chega, os blocos `<tool_call>{"name", "arguments"}</tool_call>` e os
  converte em eventos `tool_call`; `promptOf` passou a mostrar, depois da
  mensagem em resposta, as ferramentas pedidas e os resultados (com o texto dos
  resultados impedido de imitar o protocolo).
- Adaptadores do Claude Code e do Codex com esse protocolo e modelos com
  `supportsTools: true`. Nada mudou no `RunManager`: o pedido segue o caminho
  único (`PermissionEngine`, validação, aprovação, execução), e cada passo é uma
  nova execução do programa.
- Defeito da Fase 12 corrigido: o prompt de sistema ia na linha de comando, que
  no Windows comporta 32.767 caracteres, menos que as instruções de um agente
  podem ter. Agora vai num arquivo temporário (`--system-prompt-file`, aceito
  pela versão instalada embora não apareça no `--help`), apagado ao fim de cada
  chamada.
- Interface: nota do formulário e aviso de provedor externo atualizados.
- `SECURITY.md` (C-25 estendido, problema conhecido novo sobre o sandbox do
  Codex), `TESTING.md`, `ARCHITECTURE.md`, `SPEC.md` e o guia.

**Validação real (2026-11-15), depois de o usuário entrar na conta.** Com o
Claude Code 2.1.325 e o modelo Haiku, num servidor à parte com dados
descartáveis: conversa simples (Fase 12) respondeu em 6,9 s; o modelo escreveu
o bloco `<tool_call>` no formato certo já na primeira tentativa e o arquivo foi
criado na pasta do agente; com "Pede aprovação", a execução esperou sem nenhum
processo do harness vivo e terminou depois da aprovação; sem a permissão de
escrita, o modelo **pediu `write_file` mesmo assim** e o `PermissionEngine`
recusou (`not_granted`), sem arquivo criado. A validação achou e corrigiu um
defeito na contagem de tokens de entrada (`SECURITY.md`, seção 10).

**Não validado.** O Codex não está instalado: segue só contra o programa
simulado.

## Fase 14 — Escritório isométrico personalizável (concluída)

**Objetivo.** Redesenhar o Escritório e o visual geral da interface no estilo da
imagem de referência do usuário (escritório isométrico em pixel art, salas
nomeadas, plantas, balões, painel lateral de presença, barra de ações, minimapa)
e tornar **personalizável pelo usuário** tanto o escritório (salas, layout,
móveis, decoração) quanto a aparência de cada agente. A imagem é só referência de
estilo: nome de marca, pessoas e dados dela não entram no produto.

**O que não muda.** O lugar de cada agente continua decidido só por `placeOf` a
partir de `/api/office` (mesa, copa, fora, visita); nada de posição de personagem
é gravado. `SceneEngine` continua sem tocar o DOM. CSP intacta: sem `style`,
sem recurso de outro domínio, posição de personagem pelo atributo `transform`.
O que passa a ser gravado é o **layout** (onde ficam salas, mesas e móveis) e a
**aparência** dos agentes — configuração, não estado.

### Decisões (aprovadas pelo usuário em 2026-11-15, todas as recomendações)

**D1 — Como guardar a personalização.**

| | Alternativa | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | Tabelas novas `office_areas` (id, tipo, nome, retângulo na grade, `project_id` opcional com `on delete set null`, piso) e `office_items` (id, tipo do catálogo, posição na grade, orientação, `area_id`, `agent_id` opcional para mesa, com `on delete set null`); coluna nova `agents.appearance` (JSON validado por Zod, nula = aparência derivada do id, como hoje). Grade e limites em `packages/shared/src/office.ts`. | Integridade pelo banco: projeto excluído deixa a sala sem vínculo, agente excluído libera a mesa. Acesso pelos repositórios como o resto. | Duas tabelas e um repositório novos. |
| B | Um documento JSON no `settings` (`office.layout`) e a mesma coluna `agents.appearance`. | Menos código. | Referências soltas a projeto e agente que o banco não protege; cada leitura precisa "limpar" ids mortos. |
| C | Tabela `office_layouts` com vários documentos JSON nomeados (presets do usuário). | Troca de layout salvo em um clique. | Mesmos contras de B; mais de um layout ainda não tem uso claro. |

A migração de A só cria tabelas e acrescenta uma coluna anulável
(`ALTER TABLE ADD COLUMN`): não reconstrói tabela, logo não depende da correção
de `runMigrations` do PR #2 (o trabalho parte da ponta desta branch de qualquer
forma). Salvar o layout é um `PUT /api/office/layout` que troca tudo numa
transação; a aparência vai no `PATCH` do agente e no arquivo de exportação
(RF-20).

**D2 — Como desenhar personagens e mobiliário.**

| | Alternativa | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | Pixel art própria em **SVG por camadas**, descrita em código como matrizes de pixels com paleta indexada (corpo/tom de pele, cabelo, roupa, calça, acessório; cada móvel em 2 orientações). Uma função pura converte a matriz em `<path>` por cor (um traço por sequência horizontal), com `shape-rendering="crispEdges"`. Trocar cor = trocar a paleta. | Personalização por camada sem multiplicar arquivos; testável como função; nada externo; o atributo `transform` continua movendo o personagem. | Autoria da arte em código (matrizes), mais trabalhosa que desenhar num editor. |
| B | Folhas de sprites PNG em `apps/web/public`, desenhadas com `<image>`. | Arte mais rica. | Recolorir exige uma folha por variação ou filtro CSS; arte em binário, sem revisão em diff; precisaria de ferramenta de desenho. |
| C | Canvas 2D para a cena inteira. | Desempenho com centenas de objetos. | Perde o DOM que os testes leem (`data-place`, `data-seated`, `data-walker`), perde links clicáveis e acessíveis; reescreve a Fase 9. |

**D3 — Projeção e geometria.** Recomendado: **isométrica 2:1 sobre uma grade de
ladrilhos**, com a geometria calculada do layout (função pura: ladrilho → ponto
na tela) em vez de medida do DOM (`measure` sai de `Walkers.tsx`). As rotas do
motor passam do esquema "porta → corredor → porta" para busca de caminho (A\*)
na grade, atravessando só piso e portas. Alternativa: visão de cima em 3/4 sem
isometria — editor e cliques mais simples, mas foge da referência.
No celular a cena ganha arrastar e aproximar, e o painel lateral vira gaveta.

**D4 — Como editar o layout.**

| | Alternativa |
|---|---|
| **A (recomendada)** | **Presets + editor em grade.** Na primeira abertura o layout é gerado a partir dos projetos existentes (nada some para quem já usa). Modelos prontos (pequeno, médio, aberto) como ponto de partida, e um modo "Editar escritório" com: desenhar e redimensionar áreas na grade, escolher tipo e nome, vincular a um projeto, pôr portas na parede, arrastar móveis do catálogo, girar, excluir, desfazer, e validação antes de salvar (sobreposição, área sem porta, piso inalcançável, recepção e copa obrigatórias). Teclado para tudo o que o mouse faz. |
| B | Só presets, com nomes e cores editáveis. Muito menos trabalho, mas não cumpre "tudo personalizável". |
| C | Só editor livre, sem presets. Cumpre, mas deixa o usuário diante de uma grade vazia. |

Mesa e agente: uma mesa do layout pode ter dono. Agente sem mesa senta na
primeira mesa livre da sala do seu projeto (decidido por função pura, sem
gravar); se não houver, aparece no painel como "Sem mesa" e o editor avisa.

**D5 — O que da imagem vira funcionalidade e o que não entra.**

| Elemento da referência | Na Fase 14 |
|---|---|
| Salas nomeadas | Real: tipos de área com comportamento. **Sala de projeto** (mesas dos agentes), **Recepção** (entrada; inativo fica fora — RF-80), **Copa** (ocioso há 2 min — RF-80). |
| Sala de Reunião | Real, se aprovado: durante uma delegação, quem delegou e quem recebeu se encontram nela (no lugar da visita à mesa); sem sala de reunião no layout, a visita continua como hoje. |
| Descompressão | Real, se aprovado: ocioso há mais tempo (proposta: 10 min) vai da copa para a área de descompressão. |
| Sala de Foco | Sala de projeto com outra decoração: o usuário pode pôr mesas de agentes nela. Sem regra própria. |
| Mural "Boas ideias!", plantas, sofás, estantes | Decoração do catálogo de móveis. Texto do mural editável pelo usuário. |
| Placas com nome das salas e balões de fala | Real: nome da área e o texto que `balloonText` já produz, em HTML dentro de `<foreignObject>` posicionado por atributo (sem `<text>`, sem `style`). |
| Painel "Pessoas Online" | Real, como **"Agentes no escritório (n)"**: rosto, nome, estado e onde está ("Na mesa", "Na copa", "Fora", "Na mesa de …"); clique abre a conversa; "Ver todos" leva a Agentes. É também a leitura acessível da cena. |
| Sino com contador | Real: aprovações pendentes, leva a Aprovações. |
| Minimapa | Real: o layout em miniatura com um ponto por agente; clicar centraliza a cena. |
| Barra inferior (microfone, câmera, tela, emoji, mais) | **Não entra**: chamada de voz, vídeo, compartilhamento de tela e reações não existem nem estão planejados. No lugar, ações reais: Editar escritório, Novo agente, Aprovações (n), Centralizar, Aproximar/afastar. |
| Usuário no rodapé à esquerda ("Disponível") | **Não entra** como presença: a plataforma é de usuário único e não tem estado de pessoa; um "Disponível" seria fictício. O rodapé da barra lateral mostra o estado real do servidor (o que a faixa de resumo já mostra). |
| Marca "WorkHub" e pessoas de exemplo | Não entram. A marca continua "Enterprise Agents". |

**D6 — Aparência dos agentes e visual do site.**

- Personagem humano em pixel art com camadas escolhidas no formulário do agente
  (nova seção "Aparência", com prévia ao vivo e "Sortear"): tom de pele,
  penteado e cor do cabelo, roupa e cor, calça, acessório (óculos, fone, boné,
  nenhum). Opção de manter o **robô** atual como um dos "tipos" de personagem,
  para quem preferir. Agente sem aparência gravada continua derivado do id, logo
  ninguém muda de cara na atualização. O avatar das listas, do chat e do painel
  usa a mesma aparência.
- Visual geral: novo tema escuro lilás/violeta inspirado na referência (barra
  lateral com item ativo em pílula, painéis arredondados, tipografia atual). A
  regra "cor saturada significa estado" se mantém nos indicadores. Alternativa:
  manter o tema atual como opção "Planta azul" e oferecer os dois nas
  Configurações (mais um item personalizável, custo pequeno).

### Escopo proposto (depois de aprovado)

1. Contrato e banco: `packages/shared/src/office.ts` (catálogo de tipos de área e
   móvel, limites da grade e do layout, esquemas `z.strictObject`), migração,
   repositório e rotas `GET/PUT /api/office/layout`, aparência no agente e na
   exportação; testes de integração.
2. Arte: gerador de SVG a partir de matrizes, personagens por camada, móveis e
   pisos isométricos; testes da função geradora.
3. Cena: projeção isométrica, A\* na grade, `SceneEngine` alimentado pela
   geometria do layout; testes puros do motor (os da Fase 9 adaptados).
4. Escritório: cena nova, placas, balões, painel de agentes, sino, minimapa,
   barra de ações, pan e zoom, celular.
5. Editor de layout com presets e validação; formulário de aparência.
6. Tema geral novo.
7. E2E (desktop e celular, incluindo editar e salvar layout, mudar aparência,
   desempenho com 30 agentes andando), `npm run check:full`, documentação viva
   (`SPEC.md` com RF novos, `ARCHITECTURE.md` seção 13, `SECURITY.md` seção 9,
   `TESTING.md` seção 7, `docs/GUIA.md`, `apps/web/CLAUDE.md`).

**Fora do escopo.** Voz, vídeo, tela compartilhada, reações; perfil ou presença
do usuário; vários andares; layouts salvos com nome além dos presets;
exportar/importar o layout do escritório (pode ser fase futura); arte
importada pelo usuário (imagens enviadas).

### O que foi feito

- Contrato em `packages/shared`: `appearance.ts` (opções enumeradas, robô derivado do id, sorteio), `office.ts` (catálogo de áreas, pisos e 18 móveis, limites, esquemas estritos), `office-grid.ts` (grade navegável, busca de caminho, validação com mensagens em português, distribuição de mesas) e `office-presets.ts` (modelos completo, compacto e amplo). O pacote ganhou testes próprios (`npm test` roda neles).
- Banco: migração `0003_office_layout.sql` com `office_areas`, `office_items` e `agents.appearance`. Ela também reconstrói `providers`: a migração manual 0002 tinha deixado o retrato do esquema do Drizzle para trás, e a próxima gerada carregou a reconstrução. Como `runMigrations` desliga as chaves estrangeiras, os dados passam intactos, com teste sobre banco existente.
- API: `/api/office` passou a trazer `layout`, `customized`, `projects` e `agents` (com `projectId` e `appearance`) no lugar de `rooms`; `PUT /api/office/layout` (tudo ou nada, revalidado no servidor) e `DELETE /api/office/layout` (volta ao automático). A aparência vai no agente, na duplicação e no arquivo de exportação. Mudar só a aparência não zera o tempo de ócio (não conta como atividade).
- Interface: Escritório isométrico em pixel art (`OfficeScene.tsx`, `art/`, `components/pixel-art/`), com paredes, portas, placas, balões, painel "Agentes no escritório", sino de aprovações, barra de ações e minimapa; arrastar e aproximar pelo `viewBox`. Motor em coordenadas de ladrilho, com reunião na sala de reunião e descanso na descompressão. Editor em `/escritorio/editar` com ferramentas, formulários, lista de problemas, desfazer/refazer, teclado e modelos prontos. Seção "Aparência" no formulário do agente, com prévia, amostras de cor e "Sortear"; avatares em pixel art em todas as telas. Tema lilás com item de menu ativo em pílula violeta.
- Removidos `DeskScene.tsx`, `Walkers.tsx` e `CommonAreas.tsx` da Fase 9.

### Decisões tomadas durante a implementação

- Móveis feitos de caixas isométricas geradas em código, mais sprites de pixel para plantas e folhagens; personagens inteiramente em matrizes de pixels por camadas (12 × 24). Continua sendo arte própria em SVG por camadas (D2), só que a matriz ficou para o que é orgânico.
- Agente novo criado pelo formulário começa como pessoa sorteada; criado pela API sem aparência, continua robô.
- Agente sem mesa no layout espera na recepção (lugar `lobby`), e o painel diz "Sem mesa no layout".
- Os nomes de sala, balões e mural ficam em `<foreignObject>`: a cena inteira é `aria-hidden`, e o painel é a leitura acessível dela.

### Não validado

- O movimento e a arte foram vistos por mim em capturas do navegador embutido, num servidor à parte com dados descartáveis; ninguém olhou a cena em movimento.
- O editor foi exercitado por testes de componente e E2E (selecionar, renomear, apagar, desfazer, salvar, voltar ao automático); desenhar área arrastando o ponteiro e mover móvel arrastando foram testados só como função pura e por evento sintético, não por um ponteiro real.
- Telas de toque reais (arrastar e aproximar com dois dedos) não foram testadas; o perfil de celular do Playwright usa clique.
- A porta 4317 estava ocupada por um `npm start` de outra conversa durante a fase; a verificação no navegador usou portas 4327/5183 e uma pasta de dados temporária, com uma configuração de pré-visualização provisória que já foi removida.

## Fase 15 — Personagens 16 bits e entorno do escritório (concluída)

**Objetivo.** Personagens com mais detalhe, em pixel art 16 bits própria no
estilo de jogos isométricos de escritório (sem copiar arte de nenhum jogo), e um
entorno em volta do escritório, como se ele estivesse num prédio, numa casa ou
num parque.

**Decisões aprovadas pelo usuário em 2026-11-16:**

1. **Entorno escolhível** no editor, entre três: andar de prédio (fachada,
   janelas de vidro, cidade ao fundo), casa (quintal, cerca, árvores, calçada e
   rua) e parque/campus (gramado, caminhos, árvores, lago, bancos). Guardado com
   o layout, na entrada `office.layout` de `settings`: sem migração. Layout
   automático e layouts já salvos usam o prédio.
2. **Personagens em 3/4, quatro direções** (duas desenhadas, duas espelhadas),
   maiores (20 × 37 pixels de arte), com contorno, sombreamento, olhos com
   brilho e caminhada com quadros de animação trocados por CSS.
3. **Mais opções de aparência**: cor dos olhos, barba ou bigode, cor do
   calçado, três penteados novos e estampa na roupa. Os campos novos têm valor
   padrão, então as aparências já salvas continuam válidas.

**Fora do escopo.** Entornos além desses três; vários andares navegáveis;
clima ou ciclo de dia e noite; animação de rosto (piscar, falar).

### O que foi feito

- Personagens novos em `components/pixel-art/character.tsx`: 20 × 40 pixels de arte, desenhados em escala 0,8 para combinar com os móveis; cabeça grande, contorno escuro, sombra na pele e no cabelo, brilho no cabelo e nos olhos, sobrancelhas, orelha. Nove penteados (três novos: black power, rabo de cavalo, ondulado), três roupas com estampa lisa, listrada ou com crachá, barba por fazer, bigode ou barba, óculos, fone e boné (com aba na frente e por trás). Robô mantém o rosto de sempre sobre o corpo novo.
- Quatro direções: o motor dá a direção pelo eixo de cada passo (`headingOf`), e quem está sentado olha para a mesa. Caminhada com dois quadros de pernas alternados por CSS.
- Entorno em `features/office/art/surroundings.tsx`: prédio (céu com estrelas, torres com janelas acesas, fachada com faixas de vidro descendo, paredes externas de vidro com montantes), casa (gramado, cerca com portão na frente da entrada, paredes com janelas e beiral, calçada, rua com faixa, caminho até a entrada) e parque (gramado, caminho de areia em volta, lago, bancos, postes acesos, árvores, pinheiros e canteiros). Tudo determinístico: o mesmo layout desenha as mesmas árvores.
- Contrato: `SURROUNDINGS` e o campo `surroundings` do layout (padrão prédio; layout salvo antes é lido como prédio); opções novas de aparência com padrão, então as aparências antigas continuam valendo.
- Editor: seletor "Entorno". Formulário do agente: olhos, barba, estampa e calçado.
- Paredes um pouco mais altas (34) e moldura da vista com dois ladrilhos de entorno em volta.
- Defeito da Fase 14 corrigido: o id dos grupos de amostras de cor vinha do rótulo, e rótulos com espaço ("Cor do cabelo") quebravam o `aria-labelledby`. Agora vem de `useId`, com teste.

- Defeito encontrado em uso e corrigido: a interface recompilada para esta fase recusava a resposta de um servidor ainda na Fase 14 (sem `surroundings`), e o Escritório dava erro. A resposta sem entorno agora é lida como prédio, com teste. A causa imediata foi o `npm run build` do E2E ter recompilado a pasta `dist` que um `npm start` antigo estava servindo.

### Não validado

- Visto por mim em capturas do navegador embutido (prédio, casa e parque, e a prévia do personagem no formulário), num servidor à parte com dados descartáveis; ninguém viu a caminhada nas quatro direções em movimento.
- A arte foi desenhada à mão em matrizes de texto: a conferência foi visual e por testes de forma (tamanho de todo sprite, cor válida em todo pixel, toda opção desenhada); não houve revisão de um artista.

## Visão das Fases 16 a 18 — a plataforma como uma empresa

Objetivo do usuário (2026-11-16): que a plataforma funcione como uma empresa
real, com agentes organizados em **áreas** (desenvolvimento, marketing, dados,
produto, ou qualquer outra) trabalhando de forma coordenada, passando tarefas de
um para o outro ao longo de um fluxo.

Dois princípios guiam as três fases:

1. **Nada de fluxo fixo.** A plataforma não conhece "PO", "Dev" ou "QA". Ela
   oferece peças genéricas (área, quadro, etapa, regra de passagem, ponto de
   aprovação), e cada usuário monta as próprias áreas, agentes e fluxos.
2. **Fluxos prontos com boas práticas** servem de ponto de partida: ao criar uma
   área a partir de um modelo, ela recebe uma cópia das etapas, dos papéis e das
   permissões sugeridas, e o usuário altera o que quiser. O modelo não muda a
   área depois, e a área não muda o modelo.

**O que existe hoje e não basta.** A delegação (`delegate_to_agent`) é síncrona
e aninhada: quem delega fica parado esperando, a cadeia tem no máximo
`MAX_DELEGATION_DEPTH` níveis (padrão 3) e ciclos são recusados (C-21), então
um revisor não consegue devolver o trabalho a quem o fez. Cada agente tem só a
própria pasta, isolada dos outros. Não existe tarefa como objeto (estado,
responsável, histórico) e um agente só trabalha quando alguém escreve no chat.
A delegação continua existindo para pedidos rápidos dentro de uma execução; o
quadro é o caminho para trabalho que passa de mão em mão.

**Ordem.** Primeiro o mecanismo genérico com um único modelo (Fase 16), depois
a comunicação entre áreas (Fase 17), depois os demais modelos (Fase 18). Se as
peças aguentarem um fluxo real com idas e voltas, aguentam os outros, e é mais
barato corrigir o mecanismo antes de ter vários modelos em cima dele.

## Fase 16 — Áreas, quadro de tarefas e fluxos configuráveis (concluída)

**Objetivo.** Cada área tem um quadro de tarefas com etapas definidas pelo
usuário. Quando uma tarefa chega à etapa de um agente, ele começa a trabalhar
sozinho; ao terminar, passa a tarefa adiante pelas regras do fluxo, que a
plataforma faz valer. O usuário aprova onde quiser. Um modelo pronto, o de
desenvolvimento (responsável pelo produto → desenvolvimento → testes, com
devolução), prova o mecanismo.

### Decisões (aprovadas pelo usuário em 2026-11-16, todas as recomendações)

**D1 — O que é uma área.**

| | Alternativa | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | A área **é o projeto que já existe** (`projects`), só renomeado na interface. Agentes já têm `project_id`, e o Escritório já desenha uma sala por projeto. | Nenhuma entidade nova para agente, sala e exportação; o que o usuário já criou vira área. | "Projeto" e "área" deixam de ser coisas diferentes; quem quiser as duas noções no futuro precisará separá-las. |
| B | Tabela nova `areas`, com projetos dentro de áreas. | Separa organização (área) de trabalho (projeto). | Mais uma camada para o usuário entender e para o Escritório desenhar; sem uso claro hoje. |
| C | Agente em várias áreas (tabela de ligação). | Um especialista atende mais de um time. | Conflita com "uma mesa por agente" do Escritório; complica fila e permissões. A Fase 17 resolve o mesmo caso por pedido entre áreas. |

**D2 — Como guardar o fluxo de uma área.**

| | Alternativa | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | Tabelas `workflow_stages` (área, ordem, nome, tipo: de agente, sua ou final; responsável padrão `agent_id` com `on delete set null`; se exige a sua aprovação para sair) e `workflow_transitions` (de, para, quem pode mover: o agente da etapa, você, ou os dois). Salvar o fluxo troca tudo numa transação, como o layout da Fase 14. | O banco protege as referências: agente excluído deixa a etapa sem responsável (a tarefa para e avisa), e uma etapa com tarefas não pode ser apagada. | Duas tabelas e um repositório novos. |
| B | Um documento JSON por área (coluna `projects.workflow`), validado por Zod. | Menos código. | Tarefas apontariam para etapas que o banco não conhece; cada leitura precisaria limpar referências mortas. |

**D3 — Como um agente trabalha numa tarefa.**

| | Alternativa | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | **A tarefa dispara a execução.** Quando uma tarefa entra numa etapa de agente, a plataforma abre uma execução nova (gatilho `task`) com o contexto montado a partir da tarefa: título, descrição, critérios de aceite, histórico e as notas de quem passou. O agente termina chamando ferramentas novas: `move_task` (para uma etapa permitida, com uma nota de passagem) e `comment_task`. Se a execução terminar sem mover a tarefa, ela fica marcada como "precisa de você". | Previsível e auditável: cada passagem é uma execução nova, com passos, limites e logs como hoje; devolver o trabalho não é ciclo, é outra execução. | O agente não escolhe o que fazer em seguida: trabalha no que chega. |
| B | Os agentes consultam o quadro (`list_tasks`) e pegam tarefas sozinhos. | Mais autônomo, mais "parecido com gente". | Imprevisível e caro: agentes acordando para olhar o quadro; difícil limitar e explicar. |
| C | Tornar a delegação assíncrona, sem quadro. | Muda pouco código. | Não dá estado, histórico nem visão do trabalho, que são o objetivo. |

**D4 — Regras de passagem e proteção contra laços.** Recomendado: a
plataforma valida todo `move_task` contra as transições da etapa (o agente pede,
o servidor decide, como o `PermissionEngine` faz com ferramentas; segurança não
depende do prompt). Transições marcadas como "só você" nunca são feitas por
agente. No lugar da recusa de ciclos (C-21), que impediria a devolução, cada
tarefa tem dois tetos: **voltas** (quantas vezes ela pode retornar a uma etapa
já visitada, padrão 3) e **execuções** (total por tarefa, padrão 20). Passou de
um deles, a tarefa para e vai para você. Alternativa: só o teto de execuções,
mais simples, mas que deixa um par de agentes devolvendo trabalho um ao outro
até gastar tudo.

**D5 — Fila e simultaneidade.** Recomendado: **um agente trabalha numa tarefa
por vez**, como uma pessoa; as outras esperam na fila dele, por prioridade e
ordem de chegada, sempre dentro do limite global `MAX_CONCURRENT_RUNS`. Uma
tarefa tem no máximo uma execução ativa. Alternativa: um agente atende várias
tarefas ao mesmo tempo, mais rápido, mas confunde o Escritório (um personagem
em várias mesas) e dispara o consumo de cota.

**D6 — Pasta da área.** O modelo de desenvolvimento precisa que quem testa veja
o que foi feito, então a pasta compartilhada entra nesta fase.

| | Alternativa | Prós | Contras |
|---|---|---|---|
| **A (recomendada)** | Cada agente mantém a própria pasta e ganha acesso à **pasta da área** (`DATA_DIR/areas/<id>`) pelo prefixo `area/` nas ferramentas de arquivo. O resolvedor de caminhos continua o único caminho, agora com duas raízes confinadas; ler e escrever na pasta da área são permissões separadas por agente. | Isolamento continua valendo para o que é pessoal; o compartilhado é explícito. | Mexe no resolvedor de caminhos (C-17): exige revisão de segurança, testes de fuga para a raiz nova e atualização do `SECURITY.md`. |
| B | Os agentes de uma área passam a usar uma única pasta. | Simples. | Acaba com o isolamento entre agentes; um agente pode apagar o trabalho do outro sem nenhum controle. |
| C | Só anexos na tarefa (cópias de arquivos). | Sem raiz nova no resolvedor. | Trabalho real (código, planilhas) tem muitos arquivos; copiar a cada passagem é frágil e caro. |

**D7 — Como o modelo pronto é definido.** Recomendado: modelos **em código**, em
`packages/shared` (etapas, transições, papéis com instruções e ferramentas
sugeridas), versionados e testados com o resto. Aplicar um modelo cria a área,
as etapas e os agentes; o usuário escolhe o modelo de IA de cada agente.
Permissões sugeridas entram todas como `ask` (a mesma regra da importação de
agentes): o usuário libera o que quiser. Alternativa: modelos no banco, editáveis
na interface; fica para a Fase 18 ("salvar a minha área como modelo").

### Escopo proposto (depois de aprovado)

1. Contrato e banco: tarefas (`tasks`: área, título, descrição, critérios de
   aceite, etapa, responsável, estado, prioridade, contadores de voltas e
   execuções), histórico só de inserção (`task_events`: criada, movida,
   comentada, aprovada, execução iniciada e terminada), fluxo (D2), coluna
   `runs.task_id`; migração com teste sobre dados existentes; rotas em
   `/api/areas/:id/workflow` e `/api/tasks`.
2. Motor de tarefas: gatilho, fila por agente, montagem do contexto, tetos de
   voltas e execuções, tarefa parada quando a execução falha ou termina sem mover.
3. Ferramentas `move_task` e `comment_task`, com regras de passagem validadas no
   servidor, auditoria e testes de permissão.
4. Pasta da área (D6), com os testes de fuga do resolvedor estendidos.
5. Interface: quadro por área (colunas = etapas), detalhe da tarefa (histórico,
   notas, execuções ligadas, arquivos da pasta da área), criar e mover à mão,
   editor de fluxo, pontos de aprovação na tela de Aprovações.
6. Escritório: agente trabalhando numa tarefa aparece na mesa com o título dela
   no balão; agente com fila mostra quantas tarefas esperam.
7. Modelo "Desenvolvimento" (responsável pelo produto → desenvolvimento →
   testes → concluído, com devolução de testes para desenvolvimento e
   aprovação sua antes de concluir).
8. E2E com o provedor simulado (tarefa atravessa o fluxo, com uma devolução e
   uma aprovação), validação manual com um modelo real, `npm run check:full` e
   documentação viva (`SPEC.md` com requisitos novos, `ARCHITECTURE.md`,
   `SECURITY.md`, `TESTING.md`, `docs/GUIA.md`).

**Segurança.** Texto de tarefa, nota de passagem e comentário de agente são dado
não confiável: renderizados pelo componente `Markdown` e levados ao modelo
rotulados como dados. Um agente pode tentar convencer o próximo a fazer algo
indevido (injeção de prompt entre agentes); quem contém isso continua sendo o
`PermissionEngine` de cada agente e as regras de passagem, nunca o texto.

### O que foi feito

- Contrato em `packages/shared`: `tasks.ts` (fluxo, tarefas, quadro, limites) e `workflow-templates.ts` (o modelo Desenvolvimento, com papéis, instruções, ferramentas sugeridas, etapas e passagens).
- Banco: migrações `0004_areas_tasks` (tabelas `workflow_stages`, `workflow_transitions`, `tasks`, `task_events`; colunas `agents.area_access` e `runs.task_id`; só cria, sem reconstruir tabela) e `0005_task_events_append_only` (gatilhos). Testadas sobre dados existentes.
- Servidor: módulo `modules/tasks` (repositório, regras e rotas em `/api/areas/:id/workflow`, `/api/areas/:id/board`, `/api/areas/:id/tasks`, `/api/tasks/...`, `/api/workflow-templates`, `/api/areas/from-template`); o despachante abre a execução da tarefa quando o agente da etapa está livre e reage ao fim de cada execução pelo `EventBus`; ferramentas `move_task` e `comment_task`; pasta da área no resolvedor de caminhos; balão do Escritório mostra a tarefa.
- Interface: menu Tarefas com o quadro por área, a página da tarefa (pedido, histórico, mover, comentar, retomar, cancelar), o editor de fluxo, a criação de área a partir de modelo, o campo "Pasta compartilhada da área" no agente e "Tarefas esperando você" na tela Aprovações.
- E2E novo (`tasks.spec.ts`): uma área do modelo, uma tarefa que os agentes passam sozinhos até a revisão do usuário, que conclui.

### Decisões tomadas durante a implementação

- **Ferramentas do quadro sem concessão por agente.** `move_task` e `comment_task` passam pelo `PermissionEngine` com uma regra própria: permitidas só numa execução de tarefa e negadas fora dela, nunca concedidas por agente. Exigir "Pede aprovação" a cada passagem pararia o fluxo a cada etapa; a proteção delas é a regra do fluxo, conferida no servidor (C-26).
- **Ponto de aprovação é uma etapa do usuário.** No lugar de uma marca "exige aprovação para sair" (D2), uma etapa do tipo "Você" segura a tarefa até o usuário movê-la. É mais visível no quadro e não precisa de um mecanismo à parte.
- **Volta é passagem para uma etapa anterior na ordem do fluxo**, e só conta quando o agente a faz; a do usuário é decisão dele.
- **Área com tarefas não pode ser excluída**, e uma tarefa é cancelada, nunca apagada: o histórico, que só aceita inserção, continua legível.
- **Acesso à pasta da área é um campo do agente** (nenhum, leitura, leitura e escrita), não uma ferramenta; ler e escrever continuam dependendo das ferramentas de arquivo concedidas. Na importação ele sempre entra como "nenhum", com aviso.
- **O script continua só na pasta pessoal**: um caminho `area/` no script é recusado com explicação, em vez de apontar para uma subpasta pessoal chamada "area".

### Não validado

- Nenhum modelo real atravessou um fluxo: os testes usam o provedor simulado, em processo e no E2E. Se um modelo real escreve notas úteis e usa `move_task` no momento certo é a primeira coisa a ver com o Claude Code conectado.
- O editor de fluxo foi exercitado por testes de componente, não pelo E2E nem em celular.

**Fora do escopo.** Pedidos entre áreas e tarefas filhas (Fase 17); outros
modelos e "salvar como modelo" (Fase 18); agendamento por horário; agente em
mais de uma área; ferramentas novas além de `move_task` e `comment_task`.

**Riscos.** A qualidade do trabalho depende do modelo: modelos locais pequenos
não sustentam um fluxo de desenvolvimento. Um fluxo com idas e voltas faz muitas
chamadas e, pelo harness, cada passo com ferramenta executa o programa de novo:
os tetos de D4 e o limite de tokens por execução são o que segura o consumo.

## Fase 17 — Pedidos entre áreas (proposta)

**Objetivo.** Uma área pede trabalho a outra, como numa empresa: o marketing
pede um número à área de dados, o produto envia uma especificação ao
desenvolvimento. A resposta volta para quem pediu.

**Decisões a aprovar (resumo; detalhadas ao abrir a fase).**

- **D1 — Forma do pedido.** Recomendado: o pedido cria uma **tarefa filha** na
  primeira etapa do fluxo da outra área (`tasks.parent_task_id`); a tarefa de
  origem fica "aguardando outra área" e volta a andar quando a filha chega à
  etapa final, com o resultado e os arquivos entregues anexados. Alternativa:
  mensagem entre áreas, sem tarefa, que não deixa estado nem histórico.
- **D2 — Quem pode pedir a quem.** Recomendado: uma regra por par de áreas
  ("Marketing pode pedir a Dados"), configurada pelo usuário e validada no
  servidor; pedido sem regra é recusado. Pode exigir a sua aprovação antes de
  entrar no quadro da outra área.
- **D3 — Arquivos entre áreas.** Recomendado: a entrega vai como anexo copiado
  para a pasta da área que pediu, nunca acesso direto à pasta da outra área.
- **D4 — Proteção contra laços.** Profundidade máxima de tarefas filhas (padrão
  3) e recusa de pedido que volte a uma área que já está na cadeia daquela tarefa.

**Escopo.** Ferramenta `request_from_area`, regras por par de áreas, tarefa
filha ligada à de origem, tela de pedidos abertos entre áreas, ligação entre as
salas no Escritório (um agente "leva" o pedido à sala da outra área), testes e
documentação viva.

## Fase 18 — Catálogo de fluxos prontos (proposta)

**Objetivo.** Mais modelos com boas práticas e a possibilidade de o usuário
salvar e reaproveitar os próprios fluxos.

**Modelos candidatos** (cada um com etapas, papéis, instruções e permissões
sugeridas, revisados antes de entrar):

| Modelo | Fluxo | Boa prática embutida |
|---|---|---|
| Desenvolvimento (Fase 16) | Produto → Desenvolvimento → Testes → Concluído | Testes devolvem ao desenvolvimento; critérios de aceite obrigatórios |
| Marketing | Briefing → Redação → Revisão → Sua aprovação → Publicado | Nada é publicado sem a sua aprovação |
| Dados | Pedido → Análise → Validação → Entregue | Outro agente confere os números antes da entrega |
| Produto | Ideia → Especificação → Priorização → Enviado a uma área | A especificação vira pedido para outra área (Fase 17) |
| Conteúdo e documentação | Rascunho → Revisão técnica → Revisão de texto → Publicado | Dois revisores com focos diferentes |

**Decisões a aprovar ao abrir a fase.** Onde ficam os modelos do usuário (banco,
com exportação e importação em arquivo como os agentes, RF-20); o que um modelo
salvo leva (etapas, transições, papéis e instruções, nunca chaves, endereços ou
permissões `allow`); e quais ferramentas novas cada modelo realmente exige. Uma
ferramenta nova (busca na web, leitura de planilha, execução de testes) é
decisão própria, com nível de risco, testes de permissão e controle no
`SECURITY.md`; executar testes de código, em particular, depende do executor
isolado em contêiner, que está nas melhorias futuras.

## Pendências ao final do projeto

- OpenAI e Anthropic nunca foram validados com o serviço real (não há chave); só contra servidores simulados.
- O provedor de Codex (Fases 12 e 13) nunca foi validado: o Codex não está instalado. Falta conferir o formato real da saída dele e se o sandbox o impede de ler arquivos por conta própria. O Claude Code foi validado com um único modelo (Haiku) e poucas execuções: com que frequência um modelo erra o formato dos pedidos de ferramenta não foi medido.
- Critério de aceite 1 (`SPEC.md`, seção 8), instalar em uma máquina limpa, não foi verificado: tudo foi feito nesta máquina.
- Encerramento por `Ctrl+C` em terminal interativo nunca foi verificado à mão.
- O movimento do Escritório não foi visto por uma pessoa.
- O E2E falha de vez em quando sem causa identificada (`TESTING.md`, seção 8).
- `npm audit` completo: 11 avisos moderados em ferramentas de desenvolvimento, aceitos (`SECURITY.md`, seção 10).
- macOS e Linux não foram testados.
- Limitações de produto aceitas: `SPEC.md`, seção 9.

## Funcionalidades entregues

Todos os requisitos funcionais de `SPEC.md`: infraestrutura (RNF-02 a RNF-12), RF-01 a RF-20, RF-30 a RF-36, RF-40 a RF-44, RF-50 a RF-55, RF-60 a RF-63, RF-70 a RF-73 e RF-80.

## Melhorias futuras (fora do escopo atual)

- Fluxos de trabalho declarativos (grafo de tarefas, paralelismo configurável).
- Execução de scripts isolada em contêiner.
- Instalador desktop (Tauri ou Electron).
- Agentes baseados no Claude Agent SDK.
- Suporte a servidores MCP como fonte de ferramentas.
- Agendamento de execuções.
- Memória de longo prazo e base de conhecimento por agente.
- Interface em outros idiomas.
