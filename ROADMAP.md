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
| 16 | Áreas, quadro de tarefas e fluxos configuráveis | Concluída em 2026-11-16 |
| 17 | Pedidos entre áreas | Concluída em 2026-11-16 |
| 18 | Catálogo de fluxos prontos | Concluída em 2026-11-16 |
| 19 | Agendamento de tarefas | Concluída em 2026-11-16 |
| 20 | Sistema visual | Concluída em 2026-11-19 |
| 21 | Moldura: menu, barra do topo e busca | Concluída em 2026-11-19 |
| 22 | Personagens 32 bits | Concluída em 2026-11-19 |
| 23 | Prédio, móveis e cidade | Concluída em 2026-11-19 |
| 24 | Motor 3D e câmera | Concluída em 2026-11-19 |
| 25 | Arquitetura, luz e cidade em 3D | Concluída em 2026-11-19 |
| 26 | Móveis detalhados em 3D | Concluída em 2026-11-19 |
| 27 | Personagens voxel 3D | Concluída em 2026-11-19 |
| 28 | Interação e editor na cena 3D | Concluída em 2026-11-19 |
| 29 | Escritório como tela inicial | Concluída em 2026-11-19 |
| 30 | Indicadores reais | Concluída em 2026-11-19 |
| 31 | Telas internas no mesmo padrão | Concluída em 2026-11-20 |
| 32 | Primeiros passos e polimento | Concluída em 2026-11-20 |

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

## Fase 17 — Pedidos entre áreas (concluída)

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

**Decisões aprovadas em 2026-11-16 (D1 a D5, todas como recomendadas).** D1: o
pedido é uma tarefa filha na primeira etapa da outra área; a tarefa que pediu
espera e volta a andar com a entrega; pedido cancelado a para; até 5 pedidos
abertos por tarefa; pedem o agente (`request_from_area`) e o usuário. D2: regra
por par de áreas (`area_links`), com "exige minha aprovação" ligado por padrão;
recusa deixa a tarefa que pediu seguir. D3: arquivos sempre copiados
(`pedidos/`, `entregas/`, `recebidos/`), com teto de 200 arquivos e 50 MB. D4:
cadeia de até 3 níveis, sem voltar a uma área da cadeia. D5: tela "Pedidos
entre áreas", tarefa de origem e filhas na página da tarefa, regras editáveis,
agente que vai à sala da outra área no Escritório.

### O que foi feito

- Contrato: `REQUEST_LIMITS`, esquemas de regra, pedido, recusa e lista de pedidos; resumo e detalhe da tarefa com `parentTaskId`, `waitingOn`, tarefa de origem, filhas e áreas que podem ser acionadas; estado `pending` e eventos `requested`, `request_approved`, `request_refused`, `delivered`; `visit` no agente do Escritório.
- Banco: migração `0006_area_requests` (tabela `area_links`; colunas `tasks.parent_task_id` e `task_events.related_task_id`; só cria e acrescenta coluna, o histórico continua só de inserção). Testada sobre dados existentes.
- Servidor: `requestWork` (regra, laço, profundidade, pedidos abertos, cópia dos arquivos), aprovar, recusar, entrega na etapa final, espera da tarefa que pediu no despachante e no fim da execução; `modules/tasks/area-files.ts` para as cópias; ferramenta `request_from_area`; rotas `/api/area-links`, `/api/requests`, `/api/tasks/:id/requests`, `/approve-request`, `/refuse-request`; briefing com as áreas que podem ser acionadas e as pastas do pedido.
- Interface: tela "Pedidos entre áreas" (`/tarefas/pedidos`), painéis "Pedidos a outras áreas" e "Pedido de outra área" na tarefa, aprovar e recusar com motivo, andamento "Aguardando outra área" no quadro, pedidos a aprovar na tela Aprovações, e o lugar "sala de outra área" no Escritório.
- E2E novo (`requests.spec.ts`): regra criada pela tela, pedido feito pela tarefa, aprovação, conclusão na outra área e entrega no histórico de quem pediu.

### Decisões tomadas durante a implementação

- **Arquivos do agente vêm da pasta dele ou da área.** O agente pode mandar com o pedido arquivos da própria pasta ou de `area/`, sempre pelo resolvedor (C-17); o usuário, da pasta da área.
- **Pedido reaberto entrega de novo.** Se o usuário tira o pedido da etapa final, a tarefa que pediu volta a esperar e recebe uma nova entrega quando ele for concluído outra vez; entregar uma vez só a deixaria esperando para sempre.
- **Cancelar a tarefa que pediu não cancela os pedidos.** O trabalho da outra área pode ser útil; a entrega é copiada mesmo assim.
- **Pedido esperando aprovação não pode ser movido**: primeiro aprovar ou recusar.
- **`request_from_area` tem risco médio**: cria trabalho em outra área; continua não concedida por agente (regra do quadro, C-26), protegida pela regra do usuário (C-27).
- **A visita ao Escritório dura 20 s** e é derivada do histórico (evento `requested`), nunca gravada; sem sala da outra área no layout, o agente fica na mesa.

### Não validado

- Nenhum modelo real pediu trabalho a outra área: os testes usam o provedor simulado (em processo) e o E2E faz o pedido pela interface.
- A ida do agente à sala da outra área foi testada como função (lugar e ponto na sala), não vista em movimento nem pelo E2E.

## Fase 18 — Catálogo de fluxos prontos (concluída)

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

**Decisões aprovadas em 2026-11-16 (D1 a D6, todas como recomendadas).** D1:
modelos do usuário no banco (`workflow_templates`); os prontos continuam no
código e não mudam; excluir um modelo não toca nas áreas criadas com ele. D2: um
modelo leva nome, descrição, boas práticas, papéis (nome, objetivo, instruções,
ferramentas sugeridas, acesso à pasta da área), etapas e passagens; nunca
chaves, endereços, modelo ou provedor, ids, permissões `allow`, tarefas ou
arquivos; ao aplicar, toda ferramenta entra como "pede aprovação". D3: "Salvar
como modelo" na tela de fluxo da área, sem editor de modelos à parte. D4:
exportar e importar em JSON; na importação, ferramenta desconhecida, de risco
alto ou só de tarefa é descartada com aviso; o acesso à pasta da área vem junto
e é mostrado antes de aplicar. D5: quatro modelos novos (Marketing, Dados,
Produto, Conteúdo e documentação) só com ferramentas que já existem. D6: tela
"Modelos de fluxo" e escolha agrupada em "Nova área a partir de modelo".

### O que foi feito

- Contrato: esquemas do conteúdo de um modelo (as mesmas regras do editor de fluxo, com o papel no lugar do agente, mais as regras dos papéis), do arquivo (`enterprise-agents/workflow-template`, versão 1), de salvar, editar e importar; `origin` (pronto ou seu), ferramentas e acesso de cada papel no resumo; os cinco modelos prontos, com teste que confere cada um.
- Banco: migração `0007_workflow_templates` (só cria a tabela), testada sobre dados existentes.
- Servidor: `modules/tasks/templates.ts` (listar, salvar a partir da área, editar, excluir, exportar, importar) e `template-repository.ts`; rotas `POST /api/workflow-templates`, `PATCH`/`DELETE /api/workflow-templates/:id`, `GET /api/workflow-templates/:id/export` e `POST /api/workflow-templates/import`; criar área aceita modelo do usuário e nunca concede ferramenta só de tarefa.
- Interface: tela "Modelos de fluxo" (`/tarefas/modelos`) com exportar, importar, editar e excluir; "Salvar como modelo" na tela de fluxo; "Nova área a partir de modelo" com os modelos agrupados e, de cada papel, o acesso à pasta e as ferramentas.
- E2E novo (`templates.spec.ts`): área salva como modelo pela tela, modelo no catálogo, exportado para arquivo, importado de volta com nome livre, cópia excluída, e o modelo oferecido ao criar área.

### Decisões tomadas durante a implementação

- **O modelo guarda o fluxo como está salvo**, não o que estiver por salvar no editor; a janela diz isso.
- **Só os agentes das etapas viram papéis.** O nome do papel volta a ser o do modelo ("Produto (Site)" vira "Produto"), para a área nova ganhar o próprio sufixo.
- **Ferramentas de risco alto saem de um arquivo, mas não de um modelo salvo por você.** Num modelo salvo da própria área, `run_script` continua como sugestão (entra como "pede aprovação"); num arquivo, é descartada com aviso.
- **Até 100 modelos salvos**, e o nome não pode repetir o de um modelo pronto.
- **Modelo gravado que não passa mais pelas regras** some da lista e não pode ser aplicado, em vez de quebrar a tela.
- **No Produto, a etapa Envio usa `request_from_area`**: o modelo não cria a regra entre áreas, porque não conhece as outras áreas do usuário; a boa prática pede para criá-la antes.

### Não validado

- Nenhum modelo real percorreu os fluxos novos: as instruções dos papéis foram revisadas na escrita, não postas à prova com um modelo de verdade.
- As telas novas não foram vistas em captura de tela.

## Fase 19 — Agendamento de tarefas (concluída)

**Objetivo.** Tirar "Agendamento de execuções" das melhorias futuras: que uma
área receba trabalho em horários marcados, sem alguém criar a tarefa ou
escrever no chat. Escolhida pelo usuário em 2026-11-16, entre as melhorias
futuras, depois do fim da Fase 18.

**Decisões aprovadas em 2026-11-16 (D1 a D6, todas como recomendadas).** D1: o
que se agenda é uma tarefa no quadro de uma área (título, descrição, critérios,
prioridade), que entra na primeira etapa e segue o fluxo; conversas de chat não
são agendadas. D2: uma vez, todo dia, toda semana (dias escolhidos) ou todo mês
(no dia 31, num mês mais curto, o último dia), sem expressão cron, no horário
desta máquina. D3: com o servidor desligado na hora marcada, ao voltar cada
agendamento cria uma tarefa só, com o horário marcado no histórico, e segue a
partir de agora. D4: enquanto a tarefa anterior do agendamento está aberta, não
cria outra e registra que pulou; até 50 agendamentos; só o usuário agenda,
nenhuma ferramenta de agente; tudo na auditoria. D5: tabela `schedules` e um
relógio no servidor (`setTimeout`, sem dependência nova). D6: tela
"Agendamentos" (`/tarefas/agendamentos`) e "Criada pelo agendamento" na tarefa.

### O que foi feito

- Contrato: regra de repetição (`scheduleRuleSchema`), `nextOccurrence` (função pura, testada sem relógio), esquemas de criar, editar e listar; `schedule` no detalhe da tarefa.
- Banco: migração `0008_schedules` (tabela `schedules`; coluna `tasks.schedule_id`), testada sobre dados existentes.
- Servidor: `modules/schedules` (repositório, serviço, rotas e o relógio em `scheduler.ts`); rotas `GET`/`POST /api/schedules`, `PATCH`/`DELETE /api/schedules/:id` e `POST /api/schedules/:id/run` ("criar agora"); `createTask` aceita a origem (agendamento, quem pediu, texto do histórico).
- Interface: tela "Agendamentos" com criar, editar, pausar, retomar, "criar agora" e excluir, a repetição por extenso, a próxima vez e o último resultado; painel "Agendamento" na página da tarefa.
- E2E novo (`schedules.spec.ts`): agendamento criado pela tela, tarefa criada agora com a origem no histórico, pedido de novo com a anterior aberta, pausa, exclusão, e a tarefa que fica no quadro.

### Decisões tomadas durante a implementação

- **No máximo uma tarefa por horário, em vez de "mesma transação" (D5).** Criar a tarefa já abre a própria transação e chama o despachante; por isso o relógio grava primeiro a próxima vez e só depois cria a tarefa. Um horário nunca vira duas tarefas; se o processo cair entre os dois passos, aquele horário se perde, o que é mais seguro que repetir.
- **`tasks.schedule_id` sem cascata no banco.** O SQLite não aceita `ON DELETE SET NULL` numa coluna acrescentada por `ALTER`; excluir um agendamento limpa essa coluna na mesma transação.
- **Pausar e retomar contam a partir de agora**: o que passou durante a pausa não é recuperado (D3 é para o servidor desligado).
- **"Criar agora" não muda a próxima vez**, e segue a regra de não empilhar.
- **Área sem fluxo**: o agendamento registra que não conseguiu criar a tarefa e o relógio segue com os outros. Excluir a área exclui os agendamentos dela.
- **O relógio nunca espera mais de uma hora** de cada vez, para notar um relógio mudado à mão ou a volta de uma suspensão.
- **A tela relê os agendamentos a cada 30 s**, para o último resultado aparecer sem recarregar.

### Não validado

- O disparo pelo relógio foi testado com horários já vencidos (ao ligar e ao reprogramar), não esperando um horário futuro chegar.
- A troca de horário de verão não foi testada: a conta usa o horário local do JavaScript, e o Brasil não tem horário de verão hoje.
- As telas novas não foram vistas em captura de tela.

## Visão das Fases 20 a 27 — a interface da proposta

Pedidas pelo usuário em 2026-11-16, a partir de uma imagem de proposta do
Escritório como tela principal: menu à esquerda, a cena no centro (um andar de
vidro sobre a cidade à noite), o time e a atividade à direita, indicadores e
ações rápidas embaixo. O roteiro visual completo, com o que cada número da
proposta exige, foi entregue como página à parte; aqui fica o controle. A
direção vale para todas: fiel à proposta, mas nenhum número ou contador sem
dado real por trás (regra 5).

Antes das fases, uma correção já feita: os personagens apareciam com um braço
só (na vista de três quartos, `character.tsx` desenhava só o braço de perto).
O braço de trás entrou nos três trajes, de frente e de costas, com teste que
reproduz o defeito. O balanço do braço ao andar fica para a Fase 22.

| Fase | Entrega | Para decidir no início dela |
|---|---|---|
| 20 Sistema visual | Tokens revisados (três níveis de superfície, vidro com borda luminosa, cores de estado), escala de tipo com mínimo de 13 px, componentes (indicador com mini gráfico, pílula de estado, cartão de agente, item de atividade, ação rápida, avatar) e uma página de referência com cada estado. Pronta quando todo texto passa em contraste AA e cada componente tem vazio, carregando, erro e foco. | Fonte; mini gráfico; onde mora a página de referência; como testar o visual |
| 21 Moldura | Menu com contadores, busca global (Ctrl K), sino com aprovações, tarefas paradas e pedidos, cartão "Você"; gaveta no celular. | Se o Painel continua ou vira "Relatórios" |
| 22 Personagens 32 bits | Sprite de 32 × 64, três a quatro tons por material, quatro direções desenhadas sem espelho, andar em 4 quadros com braço balançando; todas as opções de aparência redesenhadas, sem o usuário refazer nada. | Proporção da cabeça; robôs; opções novas |
| 23 Prédio, móveis e cidade | Plataforma de vidro com borda acesa, paredes translúcidas, escada, placas das salas; móveis redesenhados e novos, cor por móvel; cidade em camadas, árvores, postes, céu. O layout salvo continua igual. | Janelas acendendo; dia e noite; nome "Apoio IA" |
| 24 Escritório como tela inicial | Cena no centro, cartões do time, atividade recente, ações rápidas; clicar num agente destaca o cartão. | Quantos agentes antes de "Ver todos"; tela inicial |
| 25 Indicadores reais | Rota de indicadores calculada do histórico, série diária, "Como é calculado", estado sem dados. | O quarto indicador |
| 26 Telas internas | Tarefas, Agentes, Automações, Aprovações, Logs, Modelos de IA e Ferramentas com os componentes da Fase 20. | Arrastar no quadro pelo celular |
| 27 Primeiros passos | Roteiro de início, ajuda dentro da plataforma, dicas que somem, revisão de movimento e textos; auditoria WCAG 2.1 AA. | Se o roteiro pode ser pulado |

## Visão das Fases 24 a 28 — o Escritório em 3D

Pedidas pelo usuário em 2026-11-19, depois de comparar a cena SVG da Fase 23
com a proposta: a referência é um ambiente 3D estilizado, de jogo de simulação
empresarial, com volume, materiais, luz roxa e azul, sombras e muitos
detalhes, e a cena atual parece uma planta isométrica. Primeiro a fidelidade
visual, depois a interação. As fases de interface que estavam numeradas de 24
a 27 passaram a 29 a 32, sem mudar de conteúdo.

**Decisões aprovadas em 2026-11-19 (D1 a D9, todas como recomendadas).**
- D1: React Three Fiber, Drei e Three.js, com pós-processamento para brilho e oclusão; a cena carrega só quando o Escritório abre. Substitui a D1 da Fase 23 ("continuar em SVG").
- D2: móveis, prédios e personagens montados em código (peças e voxels), arte original e versionada; nenhum modelo baixado de terceiros; GLB só se uma peça exigir.
- D3: o motor da cena continua testado como função pura; uma lista espelho, fora da tela, leva os atributos que os testes e o leitor de tela leem; os E2E capturam a cena com WebGL no Chromium.
- D4: sem WebGL, a cena SVG das Fases 14 a 23 aparece no lugar, sozinha.
- D5: o editor continua em 2D até a Fase 28.
- D6: sem botões de zoom e sem minimapa; a câmera se ajusta para mostrar o escritório inteiro.
- D7: o ciclo de dia e noite da Fase 23 continua; a noite segue a referência.
- D8: a biblioteca 3D aplica estilo por código (CSSOM), o que a CSP permite; nosso código continua sem `style`. Conferido e registrado no `SECURITY.md`.
- D9: cartões e avatares fora da cena continuam com o retrato 2D até a Fase 27, que decide se ele passa a sair do personagem voxel.

**Validação de toda fase visual:** rodar o projeto, capturar a tela em
1536×864, comparar com a referência, listar as diferenças, corrigir e repetir.
A fase só fecha sem diferença evidente, ou com a diferença nomeada e o motivo.

| Fase | Entrega | Pronta quando |
|---|---|---|
| 24 Motor 3D e câmera | Cena em React Three Fiber, câmera ortográfica isométrica alta e diagonal, piso e paredes de vidro a partir do layout gravado, lista espelho dos agentes, alternativa SVG sem WebGL, sem zoom e minimapa, captura de 1536×864 nos E2E. | O layout aparece em 3D no enquadramento da referência, com 30 agentes a 60 quadros/s. |
| 25 Arquitetura, luz e cidade | Plataforma com neon roxo, vidro com reflexo e tom azulado, luz ambiente roxa, sombras, oclusão de ambiente, brilho controlado; cidade noturna em volume com janelas acesas. | Sem diferença evidente de luz, profundidade e cidade. |
| 26 Móveis detalhados | Os móveis em volume (sofá com almofadas, mesa com pernas, cadeira completa, monitor, teclado, computador, estante com livros, plantas com folhas), escala dos personagens, layouts padrão sem áreas vazias. | Cada sala da referência bate. |
| 27 Personagens voxel | Personagens voxel das opções de aparência atuais; andar, sentar, digitar, conversar, acenar. | Parecem habitantes, não ícones. |
| 28 Interação e editor | Clique no agente, balões, placas das salas, editor do escritório em 3D. | Tudo que a cena 2D fazia funciona na 3D. |

## Fase 20 — Sistema visual (concluída)

**Objetivo.** Antes de mexer nas telas, as peças: o que se repete na proposta
vira componente com regra, para tudo sair igual e acessível. As telas atuais só
mudam pelo que vem do tema; aplicar os componentes é das Fases 21, 24 e 26.

**Decisões aprovadas em 2026-11-16 (D1 a D7, todas como recomendadas).** D1:
manter a Bricolage Grotesque. D2: mini gráfico em SVG próprio, sem biblioteca.
D3: estender os tokens de `theme.css` sem renomear (três níveis de superfície
que já existiam, mais o vidro e a cor `glow`). D4: o menor tamanho de texto
passa a 13 px pelo tema; o texto da cena do Escritório, que cresce com o zoom,
fica de fora. D5: a página de referência (`/referencia`) só existe no
desenvolvimento e na compilação dos testes de ponta a ponta, com valores
marcados como exemplo. D6: teste de contraste AA lendo as cores reais do tema.
D7: capturas de tela de referência no E2E, só no desktop.

### O que foi feito

- Tema (`theme.css`): `--color-glow` (borda acesa e anel de foco), superfície de vidro (`.surface-glass`), `--text-xs` de 13 px. Quatro tons ajustados porque não passavam em AA: `accent-strong` (fundo do botão principal com o mouse em cima, 3,9:1 com texto branco, agora mais escuro), `line-strong` (borda de campo, 2,2:1, agora mais clara), `fail` e `idle` (texto sobre a própria tinta de pílula e sobre o vidro).
- Vocabulário de tons (`lib/tone.ts`) e o tom de cada estado de agente em `AGENT_STATE_STYLES`.
- Componentes novos em `src/components/`: `StatusPill`, `Sparkline`, `IndicatorCard` (com dados, sem dados, carregando, erro e "Como é calculado"), `AgentCard` e `AgentCardSkeleton` (o cartão inteiro é um link; selecionado com a borda acesa), `Avatar` (busto com ponto de estado lido por leitor de tela), `ActivityFeed` e `ActivityItem` (com itens, vazia, carregando, erro) e `QuickAction` (desligada continua visível, diz o motivo e é alcançável pelo teclado).
- Página de referência `features/reference/ReferencePage.tsx` com cores, tipo, superfícies e cada componente em cada estado. Script `build:e2e` (`vite build --mode e2e`); `npm run test:e2e` passa a usá-lo.
- O código dentro de mensagens (`Markdown`) deixou de encolher para 90%, que ficava abaixo de 13 px.

### Decisões tomadas durante a implementação

- **A página de referência sai da compilação do produto pelo próprio Vite**: a rota depende de `import.meta.env.DEV` ou do modo `e2e`, que são trocados na compilação, e a página é carregada sob demanda; na compilação normal o código dela não é gerado (conferido pela ausência do arquivo).
- **Vidro 94% opaco**: o contraste do texto foi calculado sobre o pior caso, o vidro sobre um ponto branco da cena.
- **Itens de atividade são texto simples**, não `Markdown`: títulos digitados por pessoas e modelos aparecem escapados pelo React.

### Não validado

- As capturas de referência valem para esta máquina (Windows, Chromium); em outro sistema precisam ser geradas de novo.
- Leitor de tela real não foi usado; os nomes acessíveis foram conferidos pelos testes.
- Os componentes ainda não estão em nenhuma tela do produto (Fases 21, 24 e 26).

## Fase 21 — Moldura: menu, barra do topo e busca (concluída)

**Objetivo.** A moldura que aparece em toda tela, como na proposta: menu com
contadores, ajuda e você embaixo; no topo, estado do time, busca e sino.

**Decisões aprovadas em 2026-11-19 (D1 a D7, todas como recomendadas).** D1:
menu com Automações (os agendamentos da Fase 19) e "Modelos de IA";
contadores só em Aprovações e Tarefas; "Precisa de ajuda?" no rodapé, marcado
"Fase 27". D2: o Painel fica como está; vira "Relatórios" na Fase 24, quando o
Escritório for a tela inicial. D3: busca global (Ctrl K) por `GET
/api/search`, sem diferença de maiúsculas e acentos, até 5 por grupo; telas
procuradas na interface. D4: sino montado na interface com as três listas que
já existiam, sem "marcar como lida". D5: cartão "Você" com nome e personagem
opcionais, guardado em `settings` (chave `profile`), editado em Configurações;
não é login. D6: no celular, topo compacto e a gaveta de antes, redesenhada.
D7: peças da Fase 20, testes de componente, de servidor e de ponta a ponta.

### O que foi feito

- Contrato (`packages/shared/src/frame.ts`): `searchQuerySchema`, `searchKey` e `searchRank` (começo do nome, depois começo de palavra, depois meio), `searchResultsSchema`, `profileSchema` e `PROFILE_LIMITS`.
- Servidor (`modules/frame`): `GET /api/search`, `GET` e `PUT /api/profile`. A comparação é feita em JavaScript sobre as colunas que a busca mostra, não por `LIKE`: assim `%` e `_` são letras comuns e os acentos não contam. Agente excluído nunca aparece. O perfil gravado é conferido de novo ao ser lido.
- Interface: menu (`navigation.ts`, `AppLayout.tsx`) com contadores e item atual por `isCurrent` (Tarefas não acende nas Automações); `SearchDialog.tsx` (caixa com lista, setas, Enter, Esc, tela cheia no celular); `Bell.tsx`; `YouCard.tsx`; `ProfilePanel.tsx` em Configurações; `useAttention` em `lib/frame-queries.ts`. As listas do sino entram na atualização ao vivo.
- No celular, o topo mostra só "precisam de você"; os outros dois números continuam lá para leitor de tela.

### Decisões tomadas durante a implementação

- **Contador de Tarefas** = tarefas paradas esperando você + pedidos entre áreas a aprovar; o de Aprovações = aprovações de ferramenta pendentes. A tela Aprovações continua mostrando os três.
- **O personagem do usuário** é desenhado a partir do texto fixo `voce`; escolher "Robô" no editor guarda um robô, não "sem personagem" (que é o interruptor "Usar um personagem").
- **A busca espera 150 ms** depois da última tecla antes de perguntar ao servidor, e mostra o resultado anterior até o novo chegar.

### Não validado

- Leitor de tela real; o padrão de caixa com lista foi conferido pelos nomes e atributos nos testes.
- ⌘K num Mac (só Ctrl K foi exercitado).
- As capturas de referência valem para Windows com Chromium.

## Fase 22 — Personagens 32 bits (concluída)

**Objetivo.** O time redesenhado com mais resolução e mais tons por cor, o
pixel ainda visível: sprite de 32 × 64 no lugar de 20 × 40, quatro direções
sem detalhe do lado errado, andar em 4 quadros com o braço balançando.

**Decisões aprovadas em 2026-11-19 (D1 a D8, todas como recomendadas).** D1:
32 × 64. D2: mesma altura na cena, o dobro de resolução. D3: corpo-base
espelhado, detalhes com lado (mão que segura, mão levantada, crachá,
microfone) postos depois no lado certo. D4: rampa de tons calculada da paleta
atual. D5: cabeça do robô em pixel, frente e costas, com os traços de sempre.
D6: animações só do que a cena já mostra. D7: nenhuma opção nova. D8: uma
pessoa e um robô primeiro, para aprovar o traço.

**Mudança pedida na conferência (D8).** Na primeira prévia (cabeça em 40% do
corpo, estilo "chibi"), o usuário pediu algo mais parecido com o gênero de
uma imagem de referência de um jogo social isométrico. O desenho continuou
próprio (regra do projeto: arte própria), mas seguiu os traços do gênero:
cabeça em cerca de um terço da altura, tronco e pernas longos, contorno
escuro, sombreamento simples, rosto pequeno. Essa segunda prévia foi aprovada.

### O que foi feito

- `pixel-art/figure.ts`: o personagem como máscara de materiais, desenhada com elipses e traços numa grade de 32 × 64 (cabeça, 9 cabelos, barba, 3 acessórios, 3 roupas, estampas, pernas em 4 quadros, braços em cada pose, robô de frente e de costas). `screenSideOf` diz de que lado da tela está a mão direita ou a esquerda em cada direção.
- `pixel-art/shade.ts`: sombreamento automático (contorno escuro na silhueta, brilho em cima à esquerda, sombra embaixo à direita e sob o que cobre) e `ramp`, que tira quatro tons das duas cores de cada opção.
- `pixel-art/character.tsx`: `PixelCharacter` com os quadros empilhados e mostrados em vez por classes de CSS; `PixelBust` recortado na cabeça e nos ombros; `PixelStill` para um quadro parado.
- Animações: andar em 4 quadros com o braço ao contrário da perna, digitando (2), acenando com a mão levantada (2), conversando na reunião ou numa visita (2). Com "reduzir movimento" fica só o primeiro quadro.
- Cena: `talking` na vista de cada agente; o agente trabalhando digita em vez de balançar o corpo.
- Página de referência: seções "Personagens" (as quatro direções, os quadros e as poses) e "Opções de aparência" (cada opção, de frente e de costas).

### Decisões tomadas durante a implementação

- **Partes e quadros guardados.** O teste de 30 agentes andando juntos caiu para 8 quadros por segundo com o desenho novo: montar e sombrear um quadro custava 2,2 ms, e 30 agentes começando a andar ou virando pediam centenas de quadros de uma vez. As partes que só dependem de poucas opções (cabelo, roupa, pernas, braços) são montadas uma vez, e os quadros prontos ficam guardados (até 1.500). Depois disso: 0,5 ms por quadro novo, nada para um quadro já visto, e 58 quadros por segundo no teste.
- **O aceno da mão levantada** virou 2 quadros do próprio personagem, porque o braço não é mais uma peça separada que se possa girar.
- **A falha de um agente** sacode o personagem inteiro sentado, não só a cabeça, pelo mesmo motivo.

### Não validado

- O movimento não foi visto por uma pessoa: conferido por quadros parados, capturas e testes.
- As capturas de referência valem para Windows com Chromium.

## Fase 23 — Prédio, móveis e cidade (concluída)

**Objetivo.** O andar da proposta: uma plataforma que flutua sobre a cidade,
com borda acesa, salas de paredes de vidro e móveis com cor e detalhe.

**Respostas do usuário (2026-11-19).** As janelas da cidade seguem o dia e a
noite; o andar ganha ciclo de dia e noite; "Apo IA" é uma sala criada pelo
usuário, fora do layout padrão (nada a fazer); os móveis num tamanho que case
com os personagens. O usuário pediu a plataforma "idêntica" à proposta: a
direção é seguida, mas números da proposta sem dado real (92%, 24, 98%) só
entram com dado real, na Fase 25.

**Decisões aprovadas em 2026-11-19 (D1 a D7, todas como recomendadas).** D1:
continuar em SVG, sem motor 3D. D2: plataforma clara com borda acesa, paredes
de vidro com quinas claras, degraus, painel com o logo, placas das salas. D3:
dia e noite pelo relógio da máquina (noite das 18h às 6h, troca em uma hora),
janelas que acendem uma a uma. D4: cidade em três camadas, árvores e postes,
nada clicável. D5: os 18 móveis redesenhados e 6 novos. D6: cor por móvel numa
paleta fixa, coluna `color` em `office_items` (migração 0009). D7: testes de
todo móvel em toda direção e cor, do dia e da noite sem relógio, da migração
sobre dados existentes, e capturas de dia e de noite.

### O que foi feito

- Contrato: `ITEM_COLORS` e `ITEM_COLOR_LABELS`; `colorable` no catálogo (sofá, poltrona, pufe, cadeira, bancada, tapete, banqueta); seis móveis novos (máquina de lanches, geladeira, banqueta, TV de parede, divisória de vidro, luminária); `color` em cada móvel, com "padrão" para layouts sem cor.
- Banco: migração `0009_item_colors` (coluna `color`, padrão `default`), testada sobre um móvel gravado antes.
- Arte: `IsoBox` com contorno e `tones()` (tons calculados como os dos personagens); paredes de vidro com montantes claros a cada dois ladrilhos e altura que casa com os personagens (44); móveis redesenhados, o notebook sobre a mesa de trabalho; `daylight.ts` (dia e noite, céu, janelas); entorno do prédio com céu, cidade em três camadas, chão lá embaixo com árvores, brilho sob a plataforma, borda neon, degraus e painel com o logo na parede da recepção.
- Editor: "Cor" nas propriedades dos móveis que aceitam cor.
- Layout padrão: copa com geladeira, máquina de lanches e banquetas; TV de parede na reunião; luminária na descompressão.

### Decisões tomadas durante a implementação

- **Janelas da cidade em dois caminhos por prédio** (acesas e apagadas): desenhadas uma a uma eram cerca de 20 mil elementos e deixaram os testes do editor lentos demais.
- **A luminária saiu da frente da porta** da descompressão, onde a validação do layout acusou que a sala ficava sem acesso.
- **Dia e noite são relidos a cada minuto** por cada camada do entorno; não há animação contínua, então "reduzir movimento" não precisa de tratamento especial além do que já existia.

### Revisão pedida pelo usuário (2026-11-19)

Ao ver o resultado, o usuário pediu algo mais próximo da proposta: plantas e
árvores em volume (não figuras chapadas), um entorno com os detalhes da
imagem e colado ao escritório, sem área morta, e um prédio que pareça prédio.
Feito: folhagem em blocos sombreados (`art/foliage.tsx`) nas plantas e em
todas as árvores, inclusive as da casa e do parque; prédios da cidade em duas
fileiras logo atrás do escritório, com janelas em grade por andar desenhadas
na face de cada prédio, topo com neon, antena ou casa de máquinas; base grossa
com duas linhas neon; paredes de vidro mais altas (52) e frentes de vidro no
lugar das grades baixas; degraus escuros até o chão; árvores só na frente da
base (atrás de um prédio alto não seriam vistas) e escuras à noite; painel do
logo maior; piso do corredor lilás.

Segunda revisão (mesmo dia): as árvores ainda pareciam quadradas e a cidade,
cheia demais, atrapalhava a vista do escritório. A copa virou um conjunto de
tufos redondos com luz em cima, sombra embaixo e contorno, com sombra no chão
e tronco que afina; a cidade virou três anéis espaçados (perto, meio, longe),
com falhas entre os prédios e os mais distantes esmaecendo na cor do
horizonte, sobre um chão que vai até ele.

### Não validado

- A troca de dia e noite foi vista por capturas com relógio simulado (12h e 22h), não acompanhando uma troca real.
- As capturas de referência valem para Windows com Chromium.

## Fase 24 — Motor 3D e câmera (concluída)

**Objetivo.** Trocar o desenho SVG do Escritório por uma cena 3D de verdade,
com a câmera da proposta, sem perder nada do que a cena fazia; a luz, a
cidade, os móveis detalhados e os personagens voxel são das Fases 25 a 27.

### O que foi feito

- Dependências: `three` 0.187 e `@react-three/fiber` 9.8 (com `@types/three`). A cena (`three/OfficeCanvas.tsx`) é carregada só quando o Escritório abre, num pedaço próprio do pacote (927 kB, 246 kB comprimido).
- Câmera (`three/view.ts`): ortográfica, a 38° de altura e na diagonal, olhando do canto da frente como o SVG; a vista é calculada à parte do three.js para que a câmera e a camada SVG por cima projetem cada ponto no mesmo pixel. Enquadra o andar inteiro, paredes e base, com 6% de folga, e se refaz quando o palco muda de tamanho.
- Cena: base grossa com dois fios de neon, piso de cada sala, linhas do piso, paredes de vidro (altas atrás, baixas na frente, vão nas portas) com montantes e o vidro do prédio nas bordas de trás; cada móvel como alguns volumes no lugar, na altura e na cor que vão manter (`three/model.ts`); a tela de cada mesa acesa pelo estado do agente.
- Personagens: os de 32 bits da Fase 22 pintados em texturas e de pé na cena, com os mesmos quadros de andar, digitar, conversar e acenar; o motor de posições é o mesmo (`useOfficeScene` ganhou `track`, que move qualquer coisa, não só elementos SVG).
- Camada SVG por cima (`three/OfficeOverlay.tsx`): placas, murais e balões em HTML, o clique nos agentes e as marcas que os testes leem (`data-sitter`, `data-walker`, `data-area-floor`, `data-surroundings`), posicionadas pelo atributo `transform`.
- Sem WebGL, a cena SVG das Fases 14 a 23 aparece sozinha, já enquadrada (D4); os testes de componente (jsdom) passam por ela.
- Barra de zoom e minimapa removidos (D6); `Minimap.tsx` foi apagado. O editor continua com o seu zoom (D5).

### Decisões tomadas durante a implementação

- **Camada SVG em vez do `Html` do Drei:** o `Html` posiciona por estilo inline; a camada SVG faz o mesmo pelo atributo `transform`, que a regra do projeto já usava. Por isso o Drei não foi instalado; entra quando uma fase precisar dele.
- **Volumes fundidos por material:** o andar inteiro vira poucas malhas (sólido, cada vidro, o que acende), para a cena seguir fluida com 30 agentes.
- **Os E2E do Escritório usam a placa de vídeo** (`--enable-gpu --use-angle=d3d11`): sem isso o Chromium sem janela desenha WebGL por software (SwiftShader), e a contagem de quadros mediria o emulador (30 quadros/s) e não a cena (57 a 58 na placa).
- **O link "Novo agente" saiu com a barra:** a criação continua em Agentes e no botão do painel quando não há agentes; as ações rápidas da proposta são da Fase 29.

### Comparação com a referência (1536×864)

A captura `escritorio-1536x864.png` (em `scenery.spec.ts`) foi comparada com a
proposta. Igual: enquadramento, câmera alta e diagonal, andar inteiro no centro
com o painel de agentes à direita, salas com paredes de vidro e placas, sem
zoom e sem minimapa. Diferente, e da fase seguinte: céu, cidade e luz roxa com
sombras e brilho (25); móveis ainda em volumes simples (26); personagens ainda
planos e pequenos (27); atividade recente, indicadores e ações rápidas (29 e 30).

### Não validado

- A cena SVG de reserva (sem WebGL) só foi vista pelos testes de componente, não numa captura de navegador sem WebGL.
- Os 57 a 58 quadros/s foram medidos nesta máquina (RTX 3050); numa placa integrada fraca podem ser menos.

## Fase 25 — Arquitetura, luz e cidade em 3D (concluída)

**Objetivo.** A luz e o entorno da proposta: neon roxo na borda, vidro com
reflexo e tom azulado, luz ambiente roxa, sombras, oclusão de ambiente, brilho
controlado e a cidade noturna em volume.

### O que foi feito

- Luz (`OfficeCanvas.tsx`, `Lights`): ambiente roxa, luz do céu, luz principal do alto à esquerda com sombras (mapa de 2048) e uma luz fria da direita, o azul do vidro; mais quente e mais forte de dia.
- Materiais (`three/Blocks.tsx`): cada superfície é um material: fosco, polido (pisos de ladrilho e pedra e o corredor refletem um pouco), vidro (`MeshPhysicalMaterial` com reflexo, verniz e tom azul) e aceso (mais claro que o branco, para o brilho pegar: neon, telas, luminária, máquina de lanches, logo). Móveis e árvores projetam e recebem sombra; vidro e luz não.
- Acabamento (`three/Effects.tsx`): reflexo de uma sala neutra (`RoomEnvironment`), oclusão de ambiente (`GTAOPass`) e brilho controlado (`UnrealBloomPass`, só acima do branco), tudo do próprio three.js, sem dependência nova.
- Entorno (`three/city.ts`, puro, e `three/Surroundings.tsx`): céu em degradê com estrelas à noite; rua lá embaixo com um brilho roxo sob o andar; cidade em três anéis espaçados atrás e ao lado do escritório, mais altos os de longe, com janelas em grade nas fachadas (acesas em amarelo e algumas em azul, andares inteiros às vezes), coroas de neon, antenas com luz vermelha e casas de máquinas; névoa na cor do horizonte para dar profundidade sem nunca tocar o escritório; degraus da entrada até a rua; árvores redondas na frente da base, mais escuras à noite; painel com a marca na parede da recepção.
- Base mais grossa (0,8 ladrilho) com a borda do piso acesa e dois fios de neon.

### Decisões tomadas durante a implementação

- **Sem `@react-three/postprocessing`:** os passes de efeito vêm de `three/examples`, já instalado com o three.js.
- **O brilho só pega o que passa do branco:** com o limiar no branco, de dia a cena inteira estourava; as luzes foram baixadas e o que acende é multiplicado acima de 1.
- **A névoa começa depois do canto mais distante do escritório**, calculada pela vista: a cidade some no horizonte, o escritório nunca.
- **Janelas da cidade por textura:** um desenho de fachada repetido, deslocado por prédio, em vez de uma janela por objeto; acende mais à noite pela intensidade.

### Comparação com a referência (1536×864)

Igual: cidade noturna em volume com janelas acesas e alturas variadas,
profundidade pelos anéis e pela névoa, luz roxa, neon na borda, vidro azulado,
sombras dos móveis e das árvores, brilho nas luzes. Diferente, e da fase
seguinte: móveis ainda em volumes simples (26), personagens planos e pequenos
(27), atividade recente, indicadores e ações rápidas (29 e 30). Os prédios mais
altos passam do topo do palco; na proposta o palco é mais alto e mostra mais
céu (a altura do palco é da Fase 29).

### Não validado

- Quadros por segundo numa placa de vídeo integrada.
- O brilho e a oclusão no Chromium sem placa (SwiftShader) foram vistos só nas capturas dos testes.

## Fase 26 — Móveis detalhados em 3D (concluída)

**Objetivo.** Trocar os volumes simples por móveis modelados, na escala dos
personagens, e tirar as áreas vazias das salas padrão.

### O que foi feito

- Modelos (`three/model.ts`): cada móvel montado de peças num referencial de frente e fundo (`frameOf`), que serve para qualquer direção. Mesa com pernas, painel, tampo polido, monitor com pé e tela (acesa pelo estado do agente), teclado, mouse, papel e gabinete; cadeira de escritório com base de cinco pontas, rodinhas, coluna, assento e encosto estofados e braços; sofá e poltrona com pés, base, encosto, braços, almofadas e travesseiros; estante com prateleiras, livros de alturas e cores variadas e vasinhos; bancada com portas e puxador, tampo de madeira e notebook ou fruteira; cafeteira, bebedouro, geladeira, máquina de lanches com produtos atrás do vidro, TV com rack e console, TV de parede com gráfico aceso, quadro branco com anotações, jardim vertical, divisória, luminária, tapete com borda, mesa de centro com revista e caneca, mesa de reunião com notebooks, papéis e jarra.
- Plantas com folhas em volume: lâminas em três camadas abrindo para fora e inclinadas para cima; a planta grande tem tronco e duas copas.
- Peças novas do desenho (`three/Blocks.tsx`): caixa de cantos arredondados (`RoundedBoxGeometry` do three.js), folha (elipsoide achatado) e rotação de cada peça.
- Layouts padrão (`packages/shared/src/office-presets.ts`): recepção com cadeiras atrás do balcão e um canto de espera com duas poltronas e mesa de centro; copa com três banquetas e uma planta grande; reunião com oito cadeiras em volta da mesa; descompressão com duas estantes, dois sofás em volta da mesa de centro de frente para a TV e pufe; plantas ao longo das bordas da frente e da direita do corredor.

### Decisões tomadas durante a implementação

- **Escala:** tampo da mesa a 0,44 ladrilho, assento a 0,24, estante a 1,2; o personagem em pé tem 1,05. Um teste confere essas relações.
- **O layout salvo pelo usuário não muda:** os móveis novos aparecem nele, mas a disposição das salas padrão só vale para quem usa o layout automático (ou volta a ele no editor).
- **Telas redesenhadas à parte e materiais compartilhados:** reconstruir todos os móveis a cada tela que acende, e descartar o material junto, recompilava o shader e travava a cena; com isso, 30 agentes andando voltaram a 57 a 59 quadros/s.
- **Sem projetos, a frente do andar continua aberta:** a grade tem no mínimo 12 ladrilhos e, sem salas de projeto, o corredor da frente sobra; as plantas nas bordas diminuem o vazio, e cada projeto novo ocupa esse espaço com a sua sala.

### Comparação com a referência (1536×864)

Igual: sofás laranja com almofadas, estante com livros, TV, mesa de centro;
mesas com monitores, teclados e cadeiras completas; bancada de madeira com
banquetas; reunião com cadeiras em volta da mesa; plantas com folhas; salas
cheias. Diferente, e da fase seguinte: personagens planos e pequenos (27);
painéis da direita e de baixo (29 e 30).

### Não validado

- Os móveis foram vistos de perto só nas quatro direções que os testes desenham, em capturas da noite.

## Fase 27 — Personagens voxel 3D (concluída)

**Objetivo.** Trocar os personagens planos da cena 3D por personagens voxel,
habitantes do escritório e não ícones, sem que ninguém precise escolher a
aparência de novo.

### O que foi feito

- Modelo (`three/voxel.ts`, puro): o personagem é montado das mesmas opções de aparência das Fases 14, 15 e 22, em sete partes que se movem (tronco com a cabeça, dois braços, duas coxas e duas canelas penduradas nas coxas). Cabeça com olhos (branco, íris e brilho), sobrancelhas, nariz, boca, bochechas e orelhas; os nove cabelos (curto, longo, ondulado, cacheado, black power, coque, rabo de cavalo, espetado, raspado); barba, bigode e barba por fazer; óculos, fone com microfone e boné; camiseta (antebraço à mostra), moletom (capuz, bolso e cordões) e camisa (gola e botões); estampa listrada ou crachá; calça, cinto e sapatos com sola. Robôs têm cabeça de metal com tela, olhos e boca acesos e uma ou duas antenas.
- Poses (`poseAt`, pura): em pé, andando (pernas e braços em oposição, com balanço), sentado (coxas para a frente, canelas penduradas), digitando, conversando, acenando para pedir aprovação e balançando a cabeça na falha; o que leva na mão (papel ou café) vai na mão direita.
- Cena (`three/VoxelCharacter.tsx`): cada parte é uma malha que projeta sombra; personagens de mesma aparência dividem a geometria; as poses vivas (digitar, conversar, acenar, balançar a cabeça) redesenham a cena a 24 quadros/s, e com "reduzir movimento" o personagem fica na primeira pose.
- Altura do personagem em pé: 1,15 ladrilho, acima da mesa (0,44) e abaixo da estante (1,2).

### Decisões tomadas durante a implementação

- **D9 (retratos): os cartões e avatares fora da cena continuam com o retrato 2D da Fase 22.** Um retrato voxel exigiria um desenho WebGL por avatar, em todas as telas; o retrato 2D usa as mesmas opções, as mesmas cores, e já está na proposta.
- **O desenho em textura da Fase 24 saiu** (`characterFrames`), substituído pelo personagem voxel.

### Comparação com a referência (1536×864)

Igual: personagens em volume, com cabeça e cabelo detalhados, roupas de cores
distintas, braços e pernas, sentados às mesas, em pé e andando, com animação
discreta. Diferente, e da fase seguinte: o clique e as placas já funcionam
(camada SVG da Fase 24), e o editor em 3D é da Fase 28; os painéis da direita
e de baixo são das Fases 29 e 30.

### Não validado

- Todas as combinações de aparência foram montadas pelos testes, mas vistas de perto só cinco delas, sentadas, e duas em pé.

## Fase 28 — Interação e editor na cena 3D (concluída)

**Objetivo.** Tudo o que a cena 2D fazia funcionar na 3D. O clique nos
agentes, os balões e as placas das salas já estavam na camada SVG da Fase 24;
faltava o editor do escritório, que até aqui mostrava a planta 2D (D5).

### O que foi feito

- Editor em 3D (`three/EditorCanvas.tsx`): o mesmo piso, paredes, móveis, luz, cidade e efeitos do Escritório, sem os personagens, com as telas das mesas apagadas. O que se arrasta aparece no 3D enquanto é arrastado.
- Camada SVG do editor, por cima do 3D, nos pixels da vista inteira: recebe o ponteiro, desenha a seleção, os problemas, o retângulo da área nova, o ladrilho sob o ponteiro e as placas das salas (`RoomSigns`, agora compartilhado com o Escritório), e marca o piso de cada área e de cada móvel (`data-editor-area`, `data-editor-item`) para os testes.
- Do pixel ao ladrilho: `unproject` na vista da câmera (`three/view.ts`), o inverso exato de `project`, no plano do piso. Selecionar, arrastar, desenhar área, abrir porta e apagar usam o mesmo ladrilho que antes.
- Zoom e arraste da vista do editor continuam (roda do mouse, botões, "Mostrar o escritório inteiro"): mudam o `viewBox` da camada, e a câmera segue o mesmo retângulo (`zoomedView`), de modo que marca e desenho ficam juntos em qualquer zoom.
- Sem WebGL, o editor mostra a planta SVG de antes (D4); os testes de componente continuam por ela.
- Defeito da Fase 26 corrigido de passagem: cada volume arredondado gerava um aviso no console (centenas por página); o teste `Blocks.test.ts` o reproduz.

### Decisões tomadas durante a implementação

- **O editor mantém zoom e arraste.** A D6 tirou o zoom do Escritório, que mostra tudo; no editor, aproximar ajuda a pôr móvel em ladrilho certo numa grade grande, e o critério da fase é que tudo o que a cena 2D fazia funcione na 3D.
- **A escolha do ladrilho é no plano do piso, como na planta 2D.** Clicar no alto de uma estante escolhe o ladrilho atrás dela, como antes; o contorno do ladrilho sob o ponteiro mostra qual é.

### Comparação com a referência (1536×864)

O editor mostra o escritório como a referência e como o Escritório, com o
painel de propriedades ao lado. A tela inicial com painéis à direita e
embaixo é das Fases 29 e 30.

### Não validado

- O editor em 3D no celular foi aberto pelo E2E (cabe na tela, sem rolagem lateral), mas arrastar com o dedo não foi testado.

## Fase 29 — Escritório como tela inicial (concluída)

**Objetivo.** A tela da proposta: a cena no centro, o time e a atividade à
direita, as ações rápidas embaixo; a cena e os cartões ligados entre si.

**Decisões aprovadas em 2026-11-19 (D1 a D8, todas como recomendadas).**
D1: `/` abre o Escritório; o Painel vira "Relatórios", em `/relatorios`
(como a D2 da Fase 21 previa). D2: todos os agentes em cartões, numa coluna
com rolagem, por urgência (espera você, falhou, trabalha, ocioso, inativo),
com "Ver todos os agentes" no pé. D3: clicar num agente na cena acende o
cartão dele e o traz à vista; apontar ou focar um cartão acende um anel aos
pés do agente; o cartão abre a conversa e o "Decidir" continua nele. D4:
"passo N de até M · tempo" e a tarefa no cartão, sem porcentagem. D5:
atividade recente por `GET /api/activity`. D6: ações rápidas "Criar
tarefa", "Novo agente" e "Agendar tarefa", apagadas com o motivo quando não
são possíveis. D7: nenhuma faixa reservada aos indicadores da Fase 30. D8:
cena com pelo menos metade da tela em 1366×768; no celular, abas Time e
Atividade.

### O que foi feito

- Contrato (`packages/shared/src/activity.ts`): `activityEntrySchema` (tarefa concluída, entrega entre áreas, tarefa criada por agendamento, pedido de aprovação e resposta, execução que falhou), `ACTIVITY_LIMIT` (20). A execução atual do agente em `/api/office` ganhou `startedAt`, `steps` (chamadas de modelo feitas), `maxSteps` (o limite do agente) e `task`.
- Servidor (`modules/activity`): cada fonte lida do histórico que já existia (`task_events`, `approvals`, `runs`), do mais novo ao mais antigo, juntada e cortada em 20. A tarefa concluída é a que entra numa etapa do tipo "concluída" da área; a entrega é contada uma vez, na tarefa pedida.
- Interface: `/` leva a `/escritorio`; menu com Escritório primeiro e Relatórios. A página do Escritório tem a cena, as ações rápidas embaixo e, ao lado, o time em cartões (`AgentCard`) e a atividade recente (`ActivityFeed`); no celular, abas. Selecionar na cena acende o cartão; apontar o cartão acende o anel (3D, em `VoxelCharacter`) e marca `data-lit` na camada SVG.
- "Criar tarefa" abre o formulário do quadro (`/tarefas?nova=1`) e "Agendar tarefa", o de agendamento (`/tarefas/agendamentos?novo=1`).

### Decisões tomadas durante a implementação

- **A atividade guarda o nome de um agente excluído depois**, como a atividade do Painel: é histórico, não lista de agentes.
- **"Criar tarefa" numa área sem fluxo leva ao quadro**, que pede para montar o fluxo antes (uma área nova não nasce com etapas).
- **Clique na cena não abre mais a conversa nem o pedido de aprovação**: os dois ficam no cartão (D3).
- **A descrição da página ficou mais curta**, para a cena e as ações rápidas caberem em 1536×864 sem rolar; o que ela dizia sobre a copa e a reunião continua no guia.

### Comparação com a referência (1536×864)

Igual: menu, topo, cena no centro, time em cartões e atividade à direita,
ações rápidas embaixo. Diferente, e da fase seguinte: os indicadores do
rodapé (Fase 30). Diferente de propósito: os cartões dizem passos e tempo em
vez de barra de progresso, e não há botão "Nova área" no cabeçalho (as áreas
são criadas em Tarefas).

### Não validado

- Leitor de tela real nas abas do celular e no anel da cena.
- A atividade com um modelo real trabalhando; foi exercitada com dados gravados no teste e com o provedor simulado no E2E (pedido aprovado e negado).

## Fase 30 — Indicadores reais (concluída)

**Objetivo.** Os cartões do rodapé da proposta, cada um com uma conta que se
explica e um estado honesto sem dados.

**Decisões aprovadas em 2026-11-19 (D1 a D6, todas como recomendadas).** D1:
"Concluídas hoje" (contra ontem), "Tempo médio por tarefa" (7 dias),
"Execuções sem falha" (7 dias, sem as interrompidas pelo usuário ou pelo
servidor) e, no lugar de "Produtividade", "Concluídas na semana" (contra os
7 dias anteriores), cada um com série de 7 dias. D2: dias do relógio desta
máquina. D3: `GET /api/indicators`, calculado a cada leitura, no teste de
desempenho. D4: cartões abaixo da cena; ações rápidas compactas no pé da
coluna da direita. D5: os mesmos cartões no topo de Relatórios. D6: testes
de cada conta com dados conhecidos, de componente e E2E.

### O que foi feito

- Contrato (`packages/shared/src/indicators.ts`): `indicatorsSchema`, `INDICATOR_DAYS` (7); série com `null` no dia sem nada a medir.
- Servidor (`modules/indicators`): o repositório lê duas semanas de conclusões (entrada em etapa "concluída") e de execuções que terminaram sozinhas; `countIndicators` é pura, recebe o relógio, separa por dia local e conta cada tarefa uma vez, no primeiro dia em que foi concluída.
- Interface: `features/indicators/IndicatorRow.tsx` (`indicatorViews` diz valor, comparação, tom, série e o texto do leitor de tela de cada cartão); no Escritório abaixo da cena e em Relatórios no topo. `QuickAction` ganhou a forma compacta (`compact`), que deixa a descrição de fora, mas nunca o motivo de estar apagada.
- Teste de desempenho: a semente passou a ter etapas "concluída" e 15 mil conclusões em duas semanas; os indicadores e a atividade recente entraram nas medições.

### Decisões tomadas durante a implementação

- **Mais tarefas concluídas é "boa notícia" (verde), menos é "vale olhar" (amarelo)**, e igual é neutro; o tempo médio e as execuções não ganham cor de comparação, porque não comparam com nada.
- **Dia sem nada a medir fica fora da linha do mini gráfico** e é dito como "sem dado" ao leitor de tela; trocá-lo por zero diria que o tempo médio foi zero.
- **A cena desceu para 46% da altura da janela**, para cena, cartões e coluna caberem em 1536×864 sem rolar.

### Comparação com a referência (1536×864)

Igual: menu, topo, cena, time e atividade à direita, indicadores embaixo da
cena, ações rápidas no canto inferior direito. Diferente de propósito: o
quarto indicador ("Concluídas na semana" no lugar de "Produtividade") e as
comparações em números, não em porcentagem.

### Não validado

- Em 1366×768 a cena tem 51% da largura e 46% da altura, e a página rola 44 px até o fim dos cartões; o critério da Fase 29 ("pelo menos metade da tela") vale para a largura, não para a altura.
- Uma virada de horário de verão real (a conta arredonda o dia; o teste usa um dia comum).

## Fase 31 — Telas internas no mesmo padrão (concluída)

**Objetivo.** As telas internas com as peças do sistema visual da Fase 20,
para a plataforma inteira parecer uma coisa só, e o quadro de tarefas com
arrastar entre etapas.

**Decisões aprovadas em 2026-11-20 (D1 a D8, todas como recomendadas).** D1:
arrastar no quadro com o recurso nativo do navegador, sem biblioteca; só as
etapas que o fluxo permite ficam acesas; tarefa com agente trabalhando, pedido
não aprovado ou cancelada não sai do lugar; soltar abre uma confirmação com
nota opcional. D2: no celular e pelo teclado, o botão "Mover para…" em cada
cartão, com as mesmas etapas. D3: Agentes em grade de `AgentCard`, com as
ações de hoje no pé. D4: estado sempre por `StatusPill` com o tom de `TONES`.
D5: nenhum número novo nas telas internas. D6: estado vazio com o próximo
passo. D7: painéis no nível elevado; vidro só sobre a cena. D8: teste que
barra cor de estado solta nas telas, testes de componente do arrastar e do
menu, E2E de arrastar (desktop) e de mover pelo menu (celular), capturas.

### O que foi feito

- Quadro (`features/tasks`): `moves.ts` (`movesOf`, puro: a mesma regra do servidor, lida do fluxo que o quadro já tem), `MoveTaskDialog.tsx` (a confirmação, com nota), cartões arrastáveis e colunas que aceitam ou recusam (`data-accepts`), coluna vazia com "Nenhuma tarefa aqui." para receber o cartão.
- Agentes: grade de `AgentCard`; o cartão ganhou `actions` (faixa no pé, acima do link que cobre o cartão), `dimmed` e a linha de atividade opcional.
- Peças novas do sistema visual: `Notice` (aviso em caixa no tom), `FormError`, `ToneText`, `TextLink`/`LINK`/`BACK_LINK` e `RunStatusPill`; `TONES` ganhou `edge` (borda no tom). Todas na página `/referencia`, seção "Avisos e links".
- Estados por pílula: execuções (Logs, Relatórios, página da execução), tarefas e prioridade, aprovações decididas, risco de ferramenta, provedor externo ou local.
- Vazios com próximo passo: Aprovações (ir a Ferramentas), Automações (criar o primeiro agendamento ou uma área), Logs (conversar com um agente ou limpar os filtros), Agentes filtrados (limpar a busca).
- Teste novo em `app/theme.test.ts`: nenhuma tela (`features/` e `app/`, fora a cena e a referência) usa classe de cor de estado direto.

### Decisões tomadas durante a implementação

- **"Em andamento" virou tom de informação (azul) e "Concluída" virou verde**; antes, a concluída era texto branco e a em andamento, verde. Assim o verde quer dizer "deu certo" em toda tela.
- **Selecionado é `glow`, não cor de estado**: a execução atual na árvore e a permissão marcada em Ferramentas usavam a borda azul de informação.
- **Os cartões de Agentes não mostram o que o agente faz agora**: a lista não acompanha execuções, e uma linha "Sem tarefa no momento." seria falsa enquanto ele trabalha. A linha aparece só para o que o usuário precisa corrigir (agente sem modelo).
- **Os vazios que já ficam ao lado do formulário ou do botão que resolve** (projetos, regras de pedidos, modelos de fluxo, modelos de um provedor) ficaram como estavam: o texto diz o que fazer e o controle está logo abaixo.

### Não validado

- O arrasto foi feito pelo Playwright, não por uma pessoa com mouse; a rolagem automática do quadro ao arrastar até uma coluna fora da tela não foi testada (o E2E rola a coluna para a vista antes).
- Leitor de tela no quadro durante o arrasto (o caminho acessível é o "Mover para…", testado).

## Fase 32 — Primeiros passos e polimento (concluída)

**Objetivo.** Quem abre pela primeira vez chega ao primeiro agente
trabalhando sem ler manual; a plataforma passa na auditoria WCAG 2.1 AA.

**Decisões aprovadas em 2026-11-20 (D1 a D8, todas como recomendadas).** D1:
cartão "Primeiros passos" no Escritório, acima do time, com quatro etapas
lidas dos dados. D2: pode ser pulado e retomado pela Ajuda. D3: "pulei" e
dicas fechadas no servidor (`settings`, chave `guide`; `GET`/`PUT
/api/guide`). D4: Ajuda com o próprio `docs/GUIA.md`, títulos com âncora e
tabelas (`remark-gfm`), sem HTML nem imagens. D5: cinco dicas que somem com
"Entendi" e voltam pela Ajuda. D6: revisão de movimento (teste) e de textos.
D7: auditoria com `@axe-core/playwright` em todas as telas, nos dois perfis,
sem falha crítica ou séria, e o primeiro passo feito só pelo teclado. D8: E2E
do primeiro uso, contando ações e tempo com o provedor simulado; o tempo de
uma pessoa com modelo real é validação do usuário. Retratos fora da cena
continuam 2D.

### O que foi feito

- Contrato (`packages/shared/src/guide.ts`): `TIP_IDS`, `guideSchema` (o que se grava), `GUIDE_STEPS` e `guideStateSchema` (o que a rota responde, com `done` de cada etapa).
- Servidor (`modules/frame`): `GET`/`PUT /api/guide`; `guideProgress` lê dos dados se há provedor, modelo habilitado, etapa de fluxo e tarefa; o que está gravado é conferido de novo ao ler.
- Interface: `features/guide/FirstSteps.tsx` (o cartão e `useFirstStepsOpen`), `features/help/` (`HelpPage`, `GuideDocument` com `anchorOf`), `components/Tip.tsx`, `lib/address-flag.ts` (`?novo=1` em Modelos e `?nova-area=1` em Tarefas abrem os formulários); a Ajuda saiu das áreas planejadas (`PLANNED_AREAS` ficou vazia).
- Acessibilidade (achados do axe, todos sérios, nenhum crítico): o botão de busca passou a ter como nome o texto que mostra; o `StatBoard` tirou o papel de grupo do próprio `<dl>`; as áreas que rolam (time e atividade do Escritório, tabelas do guia) recebem foco pelo teclado.
- E2E novos: `accessibility.spec.ts` (14 telas, instalação nova e com dados, desktop e celular) e `first-use.spec.ts` (servidor próprio na porta 4396).

### Decisões tomadas durante a implementação

- **Enquanto o roteiro está aberto, as ações rápidas saem do Escritório**: em 1536×864 o cartão, o time, a atividade e as ações não cabiam juntos e se sobrepunham; numa instalação nova duas das três ações estão apagadas e o cartão já leva ao passo seguinte.
- **O progresso é calculado a cada leitura**, nunca gravado: apagar a última tarefa faz o passo voltar a aparecer.
- **A consulta do guia é relida sempre que o Escritório abre**: os passos são feitos em outras telas.
- **As dicas são texto fixo da interface**; só os ids ficam no contrato, e um teste confere que todo id tem o seu lugar.

### Não validado

- O tempo de uma pessoa de verdade, com um modelo real, da instalação à primeira tarefa (o E2E mede 19 ações e 15,6 s com o provedor simulado).
- Leitor de tela real (NVDA ou Narrador) no roteiro e na Ajuda; a auditoria é automática e o teclado foi conferido só no primeiro passo.

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
- Memória de longo prazo e base de conhecimento por agente.
- Interface em outros idiomas.
