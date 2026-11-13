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
| 6 | Integração com modelos de IA | Concluída em 2026-11-12 (aguardando aprovação) |
| 7 | Execução e interação | Pendente |
| 8 | Orquestração e ferramentas | Pendente |
| 9 | Escritório vivo | Pendente |
| 10 | Segurança e qualidade | Pendente |
| 11 | Finalização e documentação | Pendente |

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

## Fases planejadas

### Fase 7 — Execução e interação
- Runtime: loop do agente, streaming, limites, cancelamento, fila; `FakeProvider` em processo para os testes.
- `EventBus`, persistência de passos, SSE com retomada.
- Chat, histórico de conversas, linha do tempo da execução.
- Tela de Logs; dashboard e Escritório com dados ao vivo.
- Escritório ilustrado (RF-08): salas com móveis, agentes sentados às mesas, animações por estado, balão de atividade, clique para abrir a conversa. Substitui a planta baixa da Fase 4.
- Controles C-07, C-13, C-14.

**Pronto quando:** RF-02 a RF-08, RF-18, RF-19, RF-30 a RF-36, RF-70, RF-71 funcionam.

### Fase 8 — Orquestração e ferramentas
- `ToolRegistry`, `PermissionEngine`, pasta de trabalho por agente.
- Ferramentas: arquivos, busca de URL, delegação, script (desligada por padrão).
- Fila de aprovações; árvore de execução.
- Escritório (RF-09): delegações visíveis entre as mesas e aprovação a partir do agente.
- Controles C-15 a C-23.

**Pronto quando:** RF-09, RF-16, RF-50 a RF-55, RF-60 a RF-63 e RF-72 funcionam e os testes de segurança correspondentes passam.

### Fase 9 — Escritório vivo
Incluída em 2026-11-12 a pedido do usuário. Depende do Escritório ilustrado (Fase 7) e das delegações (Fase 8).

- Áreas comuns desenhadas: recepção e copa, além das salas dos projetos.
- Personagens que se levantam e andam: agente ocioso há algum tempo vai à copa; agente inativo fica fora do escritório; novo agente entra pela recepção.
- Delegação mostrada como visita: o agente caminha até a mesa de quem recebe a tarefa e volta com o resultado.
- Trajetos entre salas, animação de caminhada e posição coerente após recarregar a página.
- Com a preferência "reduzir movimento" do sistema, os agentes mudam de lugar sem animação.
- É apenas apresentação: nenhum dado novo é gravado; a cena deriva do estado que já existe.
- Arte original em SVG, sem recursos externos e dentro da CSP.

**Pronto quando:** RF-80 funciona; a cena continua fluida com 30 agentes; os testes E2E do Escritório passam com e sem redução de movimento.

### Fase 10 — Segurança e qualidade
- Revisão de segurança de todo o código contra `SECURITY.md`.
- Completar E2E, testes de concorrência e de desempenho.
- `npm audit`; correção ou registro de cada achado.
- Verificação das metas de cobertura.

### Fase 11 — Finalização e documentação
- Exportar e importar agentes (RF-20).
- Revisão geral e pendências.
- Atualização final de todos os documentos.
- Guia completo de utilização (`docs/GUIA.md`) com os dez tópicos exigidos.

## Funcionalidades pendentes

Todos os requisitos funcionais de `SPEC.md`. Entregues até agora: infraestrutura (RNF-02 a RNF-08, RNF-10, RNF-12), RF-01, RF-07 (planta baixa), RF-10 a RF-15, RF-17, RF-40 a RF-44, RF-73 e o início de RF-72. RF-02, RF-03, RF-05 e RF-06 já são lidos do banco e só terão dados quando os agentes puderem ser executados (Fase 7).

## Melhorias futuras (fora do escopo atual)

- Fluxos de trabalho declarativos (grafo de tarefas, paralelismo configurável).
- Execução de scripts isolada em contêiner.
- Instalador desktop (Tauri ou Electron).
- Agentes baseados no Claude Agent SDK.
- Suporte a servidores MCP como fonte de ferramentas.
- Agendamento de execuções.
- Memória de longo prazo e base de conhecimento por agente.
- Interface em outros idiomas.
