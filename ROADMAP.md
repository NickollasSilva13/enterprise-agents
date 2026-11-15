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
| 11 | Finalização e documentação | Concluída em 2026-11-15 (aguardando aprovação) |

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

## Pendências ao final do projeto

- **Nada foi commitado desde a Fase 6.** Todo o trabalho das Fases 7 a 11 está na pasta de trabalho, sem commit.
- OpenAI e Anthropic nunca foram validados com o serviço real (não há chave); só contra servidores simulados.
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
