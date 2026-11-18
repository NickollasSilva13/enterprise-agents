# TESTING — Estratégia de testes

> Estado: Fase 11 (projeto concluído). Existem testes unitários, de API, de persistência, de segurança, de runtime, de concorrência, de componente e ponta a ponta, mais o script de desempenho e a medição de cobertura. A seção 7 registra apenas resultados de testes realmente executados.

## 1. Princípios

- Uma fase só é concluída com os testes do seu escopo executados e passando, ou com o impedimento documentado.
- Resultado de teste nunca é presumido: só entra na seção 7 o que foi rodado.
- Todo defeito corrigido ganha um teste que o reproduz.
- Testes não dependem de rede externa nem de chaves reais: provedores são simulados.

## 2. Tipos de teste e ferramentas

| Tipo | Ferramenta | O que cobre | Onde fica |
|---|---|---|---|
| Unitário | Vitest | Regras de serviço, `PermissionEngine`, validação de caminhos, limites, redação de segredos, esquemas. | `apps/server/src/**/*.test.ts`, `packages/shared` |
| Integração / API | Vitest + `fastify.inject` | Rotas reais sobre um SQLite temporário: contratos, erros, validação. | `apps/server/test/` |
| Persistência | Vitest | Migrações do zero, integridade referencial, dados após reabrir o banco. | `apps/server/test/db/` |
| Runtime | Vitest + provedor simulado | Streaming, chamadas de ferramenta, cancelamento, limites, aprovação, delegação. | `apps/server/test/runtime/` |
| Componentes | Vitest + Testing Library | Estados de carregamento, vazio e erro; formulários. | `apps/web/src/**/*.test.tsx` |
| Ponta a ponta | Playwright | Fluxos completos no navegador contra o servidor real com provedor simulado. | `apps/web/e2e/` |
| Segurança | Vitest + Playwright | Casos da seção 4. | junto aos testes de integração |
| Concorrência | Vitest | Execuções simultâneas, limite global, fila, uma execução por conversa; pedidos simultâneos à API: rajada de mensagens, cancelamentos em dobro, a mesma aprovação respondida várias vezes. | `apps/server/src/runtime/run-manager.test.ts`, `apps/server/test/runs.test.ts`, `apps/server/test/concurrency.test.ts` |
| Desempenho | Script dedicado (`tsx`) | Tempo das leituras da API sobre um banco com 20.000 execuções, de uma resposta longa em streaming e de uma rajada de 40 execuções. Falha se uma medição passa do limite. | `apps/server/test/perf/perf.ts` |
| Manual com modelo real | Roteiro | Conversa real com Ollama (e provedor externo, se configurado). | seção 6 |

### Provedor simulado

Há dois. Nos testes do servidor, `FakeProvider` (`apps/server/test/fake-provider.ts`) implementa `ModelProvider` dentro do processo e reproduz roteiros determinísticos: texto em trechos, erro, resposta que fica aberta até o teste liberar, resposta que nunca termina e resposta que ignora o cancelamento. Também pede ferramentas, com os argumentos que o teste quiser (inclusive inválidos). Nos testes E2E, um processo à parte (`apps/web/e2e/fake-provider.mjs`) fala o protocolo do Ollama por HTTP, inclusive a conversa em streaming e as chamadas de ferramenta (palavras `anote` e `delegue a "<agente>"` na mensagem), para que o caminho inteiro (adaptador, rede, runtime, SSE, navegador) seja exercitado.

## 3. Como executar

| Comando | Efeito |
|---|---|
| `npm test` | Unitários, integração e componentes. |
| `npm run test:e2e` | Compila a interface e roda os testes ponta a ponta (Playwright, Chromium) em desktop e celular. Não faz parte do `check`. |
| `npm run test:perf` | Desempenho: prepara o volume em um banco temporário, mede e imprime a tabela. Não faz parte do `check`. |
| `npm run test:coverage` | Testes do servidor com cobertura; falha se alguma área ficar abaixo da meta da seção 5. |
| `npm run typecheck` | `tsc --noEmit` em todos os pacotes. |
| `npm run lint` | ESLint e verificação de formatação (Prettier). |
| `npm run check` | `typecheck` + `lint` + `test`. É a verificação mínima antes de fechar uma fase. |

## 4. Testes de segurança obrigatórios

| Controle | Caso de teste |
|---|---|
| C-01 | O servidor não aceita conexão por outro endereço que não `127.0.0.1`. |
| C-02 | Requisição com `Host` diferente do esperado é recusada. |
| C-03 | Requisição de escrita com `Origin` de outro site é recusada. |
| C-04 | Rota de API sem cookie de sessão válido é recusada. |
| C-03, C-04 | O mesmo vale para outras grafias do caminho: escape de URL em qualquer parte (`/%61pi/…`, `/api%2F…`), `.` e `..`, barra final e com query string. Nenhuma lê sem sessão nem grava sem a origem certa. |
| C-06 | Entradas inválidas ou grandes demais retornam erro de validação, não erro interno. |
| C-07 | Saída de modelo com `<script>`, atributos de evento, imagem remota ou link `javascript:` não executa nem carrega nada na interface (teste de componente e no navegador real). |
| C-08, C-09 | Após salvar um provedor, a chave não está no banco nem em nenhuma resposta da API. |
| C-10 | Erro de provedor contendo a chave é registrado com a chave removida. Um erro inesperado com credencial no texto vai ao log sem ela. |
| C-13 | Execução que excede tempo ou tokens é encerrada com o estado correto; o limite global enfileira o excedente. O limite de passos é exercitado com um modelo que nunca para de pedir ferramentas. O tempo em que a execução espera uma aprovação não conta. Provedor que não informa o uso de tokens não desliga o limite. Com 40 mensagens simultâneas, nunca há mais chamadas ao modelo que o limite. |
| C-14 | Cancelar aborta a chamada ao modelo (o sinal chega ao provedor), inclusive com um provedor que ignora o sinal; o texto parcial é preservado. A ferramenta em curso recebe o sinal; o script é encerrado; a execução delegada para junto. |
| C-11 | O script recebe só as variáveis que o sistema exige para iniciar um processo; uma variável secreta posta no ambiente do servidor não chega a ele. |
| C-15 | Ferramenta não concedida não executa, mesmo solicitada pelo modelo; ferramenta inexistente e argumentos inválidos também não. |
| C-16 | Ferramenta `ask` não executa antes da decisão; negada, não executa nunca; risco alto pede aprovação mesmo com `allow` gravado; a API recusa gravar `allow` para risco alto; a decisão não pode ser dada duas vezes, nem quando 12 respostas chegam ao mesmo tempo: a ferramenta roda uma vez. |
| C-17 | `..`, caminho absoluto, letra de unidade, UNC, fluxo alternativo (`:`), nomes reservados e junção ou link para fora são recusados, para ler, listar, escrever e executar. O mesmo vale dentro da pasta da área (`area/…`), que exige acesso e, para escrever, acesso de escrita, com o prefixo em qualquer grafia. |
| C-18 | Arquivo grande é lido só até o limite; conteúdo acima do limite de escrita é recusado; resultado grande de ferramenta é cortado. |
| C-19 | URLs para `127.0.0.1`, `localhost`, `10.x`, `192.168.x`, `169.254.169.254`, IPv6 local, IPv4 embutido em IPv6, IP escrito como número, nome que resolve para endereço público e privado ao mesmo tempo, e redirecionamento para esses destinos são recusados sem que nenhuma requisição saia. |
| C-20 | Com a ferramenta de script desligada, não há execução; ligada, não aceita `allow`. Argumentos hostis chegam ao script como texto; o script não lê nem grava fora da pasta e não cria processos; passa do tempo e é encerrado. |
| C-21 | Delegação além da profundidade máxima ou em ciclo (inclusive a si mesmo) é recusada. |
| C-22 | O agente delegado não usa uma ferramenta que só quem delegou tem; cada agente grava só na própria pasta. |
| C-23 | Mudança de permissão, chave da ferramenta de script, aprovação, delegação e execução de ferramenta de risco médio ou alto deixam registro de auditoria. |
| C-26 | Um agente não leva uma tarefa por passagem que o fluxo não libera nem para fora de uma etapa sua; ferramenta do quadro fora de tarefa é negada e não pode ser concedida; a tarefa que volta mais que o teto para e espera o usuário; um agente trabalha numa tarefa por vez; cancelar a tarefa interrompe a execução dela. |
| C-25 | O processo do harness não recebe variável de ambiente do servidor: uma variável secreta posta no ambiente não chega ao filho, e `ANTHROPIC_API_KEY`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY`, `CLAUDE_CODE_*` e `EA_SESSION_SECRET` são descartadas. Argumentos vão em lista, sem shell: texto com `&`, `>` e `$HOME` chega ao programa como texto. O comando cadastrado recusa argumentos (inclusive depois de um espaço), quebras de linha e início com `-`. Programa inexistente, tempo limite total, inatividade e cancelamento terminam a chamada com o erro certo. As bandeiras de isolamento são conferidas uma a uma na lista exata passada ao programa. Modelo de harness não aceita marcação de ferramentas à mão. Pedido de ferramenta escrito pelo harness (Fase 13): ferramenta não concedida não executa; a aprovação acontece sem processo do harness vivo; bloco malformado ou inacabado aparece como texto e não executa; o texto depois de um pedido é descartado; resultado de ferramenta que imita o protocolo é neutralizado no prompt; só as ferramentas concedidas são descritas; o arquivo do prompt de sistema é apagado mesmo quando a chamada falha. |

## 5. Cobertura esperada e critérios de aprovação

| Área | Meta de cobertura de linhas |
|---|---|
| `security/`, `tools/`, `PermissionEngine` | ≥ 90% |
| `runtime/` | ≥ 85% |
| Demais módulos do servidor | ≥ 80% |
| Interface | Sem meta numérica; fluxos críticos cobertos por E2E. |

As metas estão em `apps/server/vitest.config.ts` como limites: `npm run test:coverage` falha se uma delas não for atingida. Ficam fora da medição os pontos de entrada do processo (`main.ts`, `db/migrate-cli.ts`), que só rodam com o servidor de verdade e são exercitados pelo E2E, e `db/schema.ts`, que só declara tabelas.

Uma fase é aprovada quando:

1. `npm run check` passa sem erros.
2. `npm run test:e2e` passa.
3. Os testes de segurança dos controles entregues na fase passam.
4. Falhas remanescentes estão descritas em "Problemas conhecidos", com justificativa.

## 6. Roteiro manual com modelo real

Executado nas Fases 6, 7, 8 e 11, e registrado na seção 7 com data e modelo usado:

1. Configurar o Ollama, testar a conexão e habilitar um modelo.
2. Criar um agente e conversar; confirmar streaming.
3. Interromper uma resposta longa.
4. Reiniciar o servidor e confirmar o histórico.
5. (Fase 8) Conceder uma ferramenta com `ask`, aprovar e negar.
6. (Fase 8) Delegar de um coordenador a um especialista.
7. (Fase 11) Exportar os agentes e importar o arquivo de volta.

Se o Ollama não estiver instalado na máquina, o roteiro fica pendente e isso é informado no fechamento da fase.

## 7. Registro de execuções

| Data | Fase | Comando | Resultado |
|---|---|---|---|
| — | 2 | — | Fase de documentação; nenhum teste automatizado existe ainda. |
| 2026-11-12 | 3 | `npm run check` | Passou. Tipos e lint sem erros; servidor: 5 arquivos, 73 testes; interface: 1 arquivo, 4 testes. |
| 2026-11-12 | 3 | `npm audit` | 14 avisos moderados, só em dependências de desenvolvimento; `npm audit --omit=dev`: 0. Ver `SECURITY.md`, seção 10. |
| 2026-11-12 | 3 | Manual: `npm start` | Página em `http://127.0.0.1:4317` mostrou servidor online e banco conectado; cookie invisível a scripts; `Host` forjado → 403; sessão sem `Origin` ou com origem externa → 403; porta escutando só em `127.0.0.1`; `data/app.db` criado. |
| 2026-11-12 | 3 | Manual: `npm run dev` | Interface em `127.0.0.1:5173`; sessão e `/api/health` funcionando pelo proxy. |

| 2026-11-12 | 4 | `npm run check` | Passou. Servidor: 9 arquivos, 99 testes; interface: 4 arquivos, 33 testes. |
| 2026-11-12 | 4 | `npm run test:e2e` | Passou: 17 testes, 1 ignorado de propósito (teclado no celular). Sete execuções seguidas sem falha com 2 navegadores em paralelo. |
| 2026-11-12 | 4 | `npm audit --omit=dev` | 0 vulnerabilidades. |
| 2026-11-12 | 4 | Manual: capturas de tela | Painel, Escritório, área planejada e menu conferidos em 1280 px e em celular (Pixel 7), com dados de exemplo. |

| 2026-11-12 | 5 | `npm run check` | Passou. Servidor: 10 arquivos, 138 testes; interface: 6 arquivos, 59 testes. |
| 2026-11-12 | 5 | `npm run test:e2e` | Passou: 21 testes, 1 ignorado de propósito. Duas execuções seguidas sem falha. Inclui o ciclo completo de um agente (criar, validar, editar, recarregar, duplicar, desativar, excluir) em desktop e celular. |
| 2026-11-12 | 5 | Manual: capturas de tela | Lista de agentes, formulário com erros e diálogo de exclusão conferidos em 1280 px e em celular. |

| 2026-11-12 | 6 | `npm run check` | Passou. Servidor: 12 arquivos, 209 testes; interface: 7 arquivos, 77 testes. |
| 2026-11-12 | 6 | `npm run test:e2e` | Passou: 25 testes, 1 ignorado de propósito. Duas execuções seguidas sem falha. |
| 2026-11-12 | 6 | Manual com modelo real | Ollama 0.40.16 e `llama3.2:3b`. Pela interface real: provedor adicionado, modelos buscados sozinhos, modelo habilitado, teste de conexão "bem-sucedida, respondeu em 5 ms". Pelo adaptador: resposta em português em 44 trechos (primeiro em 4,0 s, total 4,6 s), uso de 46 + 45 tokens, e cancelamento após 5 trechos. |

| 2026-11-13 | 7 | `npm run check` | Passou. Servidor: 14 arquivos, 249 testes; interface: 9 arquivos, 98 testes. |
| 2026-11-13 | 7 | `npm run test:e2e` | Passou: 27 testes, 1 ignorado de propósito. Três execuções completas seguidas sem falha, depois de elevar o tempo de espera das verificações para 20 s (ver seção 8). Inclui o fluxo de conversa em desktop e celular: provedor, agente, resposta em streaming, saída hostil do modelo, recarga no meio da resposta, interrupção, logs, painel, escritório ao vivo e agente inativo. |
| 2026-11-13 | 7 | `npm audit --omit=dev` | 0 vulnerabilidades. `npm audit` completo: os mesmos avisos moderados em ferramentas de desenvolvimento. |
| 2026-11-13 | 7 | Manual com modelo real | Ollama e `llama3.2:3b`, pela interface real em `http://127.0.0.1:4317`, com um navegador automatizado: mensagem enviada a um agente, indicador "Escrevendo…" em 0,25 s, resposta completa em Markdown (lista) em 14 s contando a carga do modelo, 155 tokens registrados; o Escritório mostrou o agente digitando com o balão da pergunta. Resposta longa interrompida: a tela mostrou "Interrompida por você" 0,13 s depois do clique, com o texto parcial preservado. Nenhum erro no console. Itens 1 a 3 do roteiro da seção 6. |
| 2026-11-13 | 7 | Manual: capturas de tela | Chat (escrevendo, concluído, interrompido), Escritório, Painel, Logs e página de execução conferidos em 1280 px; Escritório conferido em 360 px exatos, sem rolagem horizontal. |

| 2026-11-13 | 8 | `npm run check` | Passou. Servidor: 19 arquivos, 405 testes; interface: 10 arquivos, 113 testes. |
| 2026-11-13 | 8 | `npm run test:e2e` | Passou: 29 testes, 1 ignorado de propósito. Depois dos ajustes finais, 5 execuções completas: 4 sem falha (as 3 últimas seguidas) e 1 com uma falha que não foi identificada, com duração compatível com o congelamento descrito na seção 8. Inclui o fluxo de ferramentas em desktop e celular: sem permissão o agente só conversa; permissões concedidas na tela; pedido parado à espera; negar com motivo; aprovar pela mesa do agente no Escritório; delegar; árvore e passos nos logs; decisões registradas. |
| 2026-11-13 | 8 | `npm audit --omit=dev` | 0 vulnerabilidades. |
| 2026-11-13 | 8 | Manual com modelo real | Ollama 0.40.16 e `llama3.2:3b`, pela interface real, com navegador automatizado, em um servidor à parte com dados descartáveis (porta 4396), para não tocar no banco de uso. Itens 5 e 6 do roteiro: agente com "Escrever arquivo" em "Pede aprovação"; o modelo pediu `write_file` com `ola.txt`; o cartão mostrou caminho e conteúdo exatos; nenhuma pasta ou arquivo existia antes da decisão; aprovado pelo botão "Decidir" na mesa do agente no Escritório; o arquivo apareceu com o conteúdo pedido e a execução terminou 0,35 s depois. Delegação: o modelo chamou `delegate_to_agent`, a execução filha do segundo agente respondeu "Olá!" e a árvore apareceu nos logs. Nenhum erro no console. A negação com modelo real não foi feita à mão (coberta por testes automatizados e pelo E2E). |
| 2026-11-13 | 8 | Manual: capturas de tela | Ferramentas, conversa com pedido de aprovação, Escritório com o botão "Decidir", execução com a árvore e Aprovações conferidas em 1280 px. Em celular, só pelo E2E (sem rolagem horizontal). |

| 2026-11-15 | 11 | `npm run check` | Passou. Servidor: 24 arquivos, 453 testes; interface: 12 arquivos, 140 testes. |
| 2026-11-15 | 11 | `npm run test:coverage` | Passou, todas as metas atingidas. Linhas: servidor inteiro 98,0%; `security/` 93,3%; `tools/` 96,9%; `runtime/` 97,6%; `modules/agents` 100%. |
| 2026-11-15 | 11 | `npm run test:perf` | Passou, todas as medições dentro do limite (Painel: p95 de 27,6 ms; lista de agentes: 14,7 ms). |
| 2026-11-15 | 11 | `npm run test:e2e` | 42 testes, 1 ignorado de propósito. Antes dos ajustes nos roteiros do Escritório: 2 execuções sem falha e 1 com duas falhas em `office.spec.ts` (uma por 401 ao preparar dados antes de a página abrir a sessão, outra porque o pedido único de nova leitura não foi atendido), ambas corrigidas no roteiro. Depois dos ajustes, 4 execuções: 3 sem falha e 1 com uma falha em `chat.spec.ts` no celular, em uma verificação de visibilidade; a causa não foi investigada. Inclui o roteiro novo de exportar e importar em desktop e celular: download real sob a CSP, conteúdo do arquivo, importação ao lado do original, ferramenta que entra como "Pede aprovação", arquivo estranho recusado. |
| 2026-11-15 | 11 | `npm audit --omit=dev` | 0 vulnerabilidades. |
| 2026-11-15 | 11 | Manual com modelo real | Ollama 0.40.16 e `llama3.2:3b`, pela interface real, com navegador automatizado, em servidor à parte com dados descartáveis (porta 4396). Itens 1 a 4 e 7 do roteiro: provedor criado, modelos buscados, modelo habilitado; agente com "Escrever arquivo" permitida; primeira mensagem ocupou a conversa em 0,1 s e terminou em 4,0 s, com o modelo pedindo `write_file` e o arquivo `saudacao.txt` criado na pasta do agente com o texto pedido; segunda mensagem em 1,9 s; servidor encerrado e iniciado de novo sobre o mesmo banco: a conversa e as duas mensagens continuavam lá e os Logs listavam as duas execuções como concluídas; exportação baixou `agentes-2026-11-14.json` sem o endereço do provedor; a importação criou "Escritor (importado)" com o mesmo modelo e avisou do nome e da ferramenta. Nenhum erro no console. O item 3 (interromper) e os itens 5 e 6 não foram refeitos nesta fase. |

| 2026-11-15 | 12 | `npm run check` | Passou. Servidor: 27 arquivos, 509 testes; interface: 12 arquivos, 145 testes (50 testes novos nesta fase). |
| 2026-11-15 | 12 | `npm run test:coverage` | Passou, todas as metas atingidas. Linhas: servidor inteiro 97,9%; `providers/` 97,1% (`command.ts` 97,6%, `claude-code.ts` 96,9%, `codex.ts` 97,8%, `harness.ts` 95,7%); `modules/providers` 96,5%. |
| 2026-11-15 | 12 | `npm run test:e2e` | 42 testes, 1 ignorado de propósito. Duas execuções: a primeira com uma falha em `office.spec.ts` no desktop ("sai e volta pela recepção", estouro dos 30 s; o mesmo roteiro passou no celular na mesma execução, em 21,8 s), a segunda completa sem falha (41 passaram em 1,9 min, com o mesmo roteiro em 22,4 s). É o padrão intermitente descrito na seção 8; nenhum roteiro novo foi acrescentado nesta fase, porque não há harness nos servidores de teste. |
| 2026-11-15 | 12 | `npm audit --omit=dev` | 0 vulnerabilidades. |
| 2026-11-15 | 12 | Programa real (executor) | `command.test.ts` cria processos de verdade (o próprio Node com `-e`): o filho não vê `EA_TEST_LEAK_KEY` posta no ambiente do servidor; argumentos com `&`, `>` e `$HOME` chegam como texto; a pasta de trabalho é criada; tempo limite total e de inatividade, cancelamento e saída diferente de zero produzem o erro certo. |
| 2026-11-15 | 12 | Harness real (Claude Code 2.1.301) | Só o que foi observado: com o ambiente limpo, o CLI responde `Failed to authenticate: OAuth session expired and could not be refreshed`, e o adaptador transforma isso em "o harness não está conectado a uma conta". **Nenhuma conversa de verdade foi feita por harness.** A resposta anterior com `model: "<synthetic>"` foi explicada (variáveis `CLAUDE_CODE_*` herdadas desta sessão do aplicativo). |

**Não verificado na Fase 11:** a qualidade das respostas do modelo local continua ruim com ferramentas: na validação, o `llama3.2:3b` escreveu um pedido de ferramenta como texto na resposta e, na segunda pergunta, sobrescreveu o arquivo com texto truncado em vez de só responder. A plataforma fez o que o modelo pediu, dentro do que estava permitido; isso é do modelo. O encerramento do servidor na validação foi forçado, não por `Ctrl+C`. O guia `docs/GUIA.md` foi conferido contra o código e os testes em vários pontos, mas não foi seguido passo a passo por uma pessoa em uma instalação limpa. A instalação em máquina limpa (critério de aceite 1) não foi verificada.

**Não verificado na Fase 12:** nada foi validado com serviço real. O Codex não está instalado nesta máquina (bandeiras e nomes de evento vêm da documentação, testados contra um programa simulado) e a conta do Claude Code não se autentica fora do aplicativo dele, então `chat`, streaming, contagem de tokens e uma execução completa por harness não foram exercitados contra o harness real — só contra um programa simulado. A interface do harness foi conferida por testes de componente, não por captura de tela nem por roteiro E2E (não há harness disponível nos servidores de teste).

| 2026-11-15 | 13 | `npm run check` | Passou. Servidor: 29 arquivos, 533 testes; interface: 12 arquivos, 145 testes. |
| 2026-11-15 | 13 | `npm run test:coverage` | Passou, todas as metas atingidas. Linhas: servidor inteiro 97,9%; `providers/` 97,4% (`harness.ts` 98,7%, `claude-code.ts` 97,1%, `codex.ts` 97,8%). |
| 2026-11-15 | 13 | `npm run test:e2e` | Passou na primeira execução: 41 testes, 1 ignorado de propósito, em 2,1 min. Nenhum roteiro novo: não há harness nos servidores de teste. |
| 2026-11-15 | 13 | `npm audit --omit=dev` | 0 vulnerabilidades. |
| 2026-11-15 | 13 | Programa real (Claude Code 2.1.301), sem conta | Com `--safe-mode`, o evento de início listou `mcp_servers: []` e o servidor MCP de teste não recebeu nenhuma chamada; sem `--safe-mode`, o mesmo servidor foi conectado e a ferramenta dele apareceu. `--system-prompt-file` com arquivo inexistente responde "System prompt file not found", ou seja, a bandeira é aceita. As duas chamadas pararam em "OAuth session expired". |

| 2026-11-16 | 15 | `npm run check:full` | Passou na primeira rodada. Compartilhado: 1 arquivo, 19 testes; servidor: 30 arquivos, 550 testes; interface: 15 arquivos, 168 testes; cobertura do servidor 98% das linhas; E2E: 45 testes, 1 ignorado de propósito. |
| 2026-11-16 | 15 | E2E: cena com 30 agentes | Com os personagens novos e o entorno de prédio: 55,9 quadros/s (desktop) e 59,0 (celular) durante 7 s de caminhada; maior intervalo entre quadros 133 e 67 ms. Chromium sem interface, nesta máquina. |
| 2026-11-16 | 15 | Manual: navegador embutido | Servidor à parte (portas 4327/5183, dados descartáveis): oito agentes de aparências diferentes; Escritório em prédio, casa e parque; prévia do personagem no formulário. |

**Não verificado na Fase 15:** a caminhada nas quatro direções vista em movimento por uma pessoa; o desempenho caiu um pouco no desktop em relação à Fase 14 (59,4 para 55,9 quadros/s), ainda bem acima do limite de 20; outros navegadores.

| 2026-11-16 | 16 | `npm run check` | Passou. Contrato: 20 testes; servidor: 31 arquivos, 584 testes; interface: 16 arquivos, 175 testes. |
| 2026-11-16 | 16 | `npm run test:coverage` | Passou, todas as metas atingidas. Linhas: servidor inteiro 96,4%; `modules/tasks` 87,1%; `tools/` 97,2% (`workspace.ts` 98,3%). |
| 2026-11-16 | 16 | `npm run test:e2e` | Passou na primeira execução: 47 testes, 1 ignorado de propósito, em 2,1 min. Inclui o roteiro novo `tasks.spec.ts` em desktop e celular: área criada do modelo Desenvolvimento, tarefa que os agentes passam sozinhos até a revisão do usuário, que a conclui. |
| 2026-11-16 | 16 | `npm audit --omit=dev` | 0 vulnerabilidades. |

**Não verificado na Fase 16:** nenhum modelo real atravessou um fluxo (só o provedor simulado, em processo e no E2E). O editor de fluxo foi exercitado só por testes de componente, não pelo E2E nem num celular de verdade. O quadro não foi visto em captura de tela.

| 2026-11-16 | 17 | `npm run check:full` | Passou (saída 0). Contrato: 20 testes; servidor: 33 arquivos, 597 testes; interface: 17 arquivos, 182 testes; cobertura: linhas do servidor 96,25%, `modules/tasks` 90,26% (`area-files.ts` 97,1%); E2E: 49 testes, 1 ignorado de propósito, em 2,2 min, incluindo o roteiro novo `requests.spec.ts` em desktop e celular. |
| 2026-11-16 | 17 | `npm run check` | Depois de um teste a mais (arquivo fora da pasta pedido por agente): passou; servidor com 598 testes. |
| 2026-11-16 | 17 | `npm audit --omit=dev` | 0 vulnerabilidades. |
| 2026-11-16 | 17 | E2E intermitente | Antes do `check:full`, o roteiro "an agent leaves and comes back by the reception (walking)" de `office.spec.ts` falhou duas vezes (desktop e celular, na conferência de que os primeiros passos são na recepção). Falhou igual com o código da Fase 16 e passou no `check:full`: não é desta fase; parece depender da carga da máquina (havia outro servidor de desenvolvimento rodando). Também na primeira rodada, `requests.spec.ts` registrou um 401 no console por criar dados antes de a página abrir a sessão; corrigido esperando o título da página. |

**Não verificado na Fase 17:** nenhum modelo real pediu trabalho a outra área. A ida do agente à sala da outra área não foi vista em movimento. As telas novas não foram vistas em captura de tela.

| 2026-11-16 | 14 | `npm run check:full` | Passou. Compartilhado: 1 arquivo, 17 testes; servidor: 30 arquivos, 548 testes; interface: 15 arquivos, 164 testes; cobertura do servidor 98% das linhas; E2E: 45 testes, 1 ignorado de propósito. |
| 2026-11-16 | 14 | E2E: cena com 30 agentes | Na cena isométrica, 30 agentes saindo juntos: 59,4 quadros/s (desktop) e 59,7 (celular) durante os 7,0 s de caminhada; maior intervalo entre quadros 67 e 33 ms. Chromium sem interface, nesta máquina. |
| 2026-11-16 | 14 | Manual: navegador embutido | Servidor à parte (portas 4327/5183, dados descartáveis): Escritório em 1500 px com seis agentes de aparências diferentes, aproximar, um agente desligado caminhando até a porta da rua, editor carregando o layout e selecionando uma mesa por evento de ponteiro. |

**Não verificado na Fase 14:** movimento visto por uma pessoa; arrastar com ponteiro real no editor (desenhar área, mover móvel) e gestos de toque em aparelho; outros navegadores além do Chromium. A primeira rodada do E2E falhou em 8 testes por defeitos dos próprios testes (ordem alfabética esperada errada, seletor que também pegava o minimapa, filtro por nome que também pegava o balão do colega), corrigidos; a rodada completa seguinte passou.

| 2026-11-15 | 12 e 13 | Manual com harness real | Depois de o usuário entrar na conta (`claude auth status`: `claude.ai`, plano Pro). Claude Code 2.1.325 (atualizou sozinho desde a 2.1.301) e o modelo Haiku, num servidor à parte com dados descartáveis (porta 4396, `SECRET_STORE=memory`), iniciado pelo próprio aplicativo, cujo ambiente tem as variáveis `CLAUDE_CODE_*` desta sessão, descartadas por C-25. Chamada com o ambiente limpo: o evento de início mostrou `tools: []` e `mcp_servers: []`, e a resposta veio em 1,8 s. Pela interface: provedor cadastrado, quatro modelos buscados, todos "Aceita ferramentas"; teste de conexão "Claude Code 2.1.325, 1.368 ms". Conversa simples: "A capital da Austrália é Camberra.", em 6,9 s. Com "Escrever arquivo" permitida: o modelo escreveu o bloco no formato certo na primeira tentativa, `compras.txt` foi criado com "pão / leite / café" e a resposta final veio em 17,6 s (duas execuções do programa, 8,4 s e 8,6 s); a tela da conversa mostrou só o texto do agente, sem o bloco. Com "Pede aprovação": o pedido apareceu na tela Aprovações com os argumentos exatos; durante a espera havia 0 processos do harness e nenhum arquivo; aprovado pelo botão da tela, `lembrete.txt` foi criado e a execução terminou 8,4 s depois. Sem "Escrever arquivo": o modelo pediu `write_file` assim mesmo, o `PermissionEngine` recusou (`not_granted`), nenhum arquivo foi criado e o agente disse que não tinha a ferramenta. `read_file` permitida: leu `compras.txt` e respondeu "3 itens". Nenhum arquivo temporário de prompt sobrou. Defeito encontrado e corrigido: a contagem de tokens de entrada ignorava o cache do CLI (de 2 a 4 por execução; depois da correção, 1.276 e 1.458 por passo). |

**Não verificado na Fase 13:** o Codex, que continua sem instalação aqui. O Claude Code foi validado com um único modelo (Haiku), em cinco execuções: com que frequência um modelo erra o formato dos pedidos de ferramenta não foi medido. Os cliques da validação foram disparados de dentro da página (o painel do navegador não desenhava, com a janela atrás de outra), e não houve captura de tela da conversa com ferramenta.

| 2026-11-14 | 10 | `npm run check` | Passou. Servidor: 23 arquivos, 440 testes; interface: 11 arquivos, 133 testes. |
| 2026-11-14 | 10 | `npm run test:coverage` | Passou, todas as metas atingidas. Linhas: servidor inteiro 97,9%; `security/` 93,3%; `tools/` 96,9% e `tools/builtin/` 98,1%; `runtime/` 97,6%; `http/` 96,5%; `providers/` 96,9%; módulos entre 96,4% e 100%. |
| 2026-11-14 | 10 | `npm run test:perf` | Passou. Banco com 200 agentes, 20.000 execuções, 120.394 passos, 2.000 conversas e 40.000 mensagens. p95 de 40 leituras: Painel 40,4 ms; Escritório 37,2 ms; lista de agentes 22,3 ms; Logs 3,0 ms (14,3 ms com filtro por estado); execução com 400 passos 5,5 ms; conversa 2,1 ms; aprovações 1,1 ms. Resposta de 2.000 trechos, do envio ao fim: 44 ms. Rajada de 40 execuções de 2.000 trechos, 4 por vez: 237 ms. Uma única execução do script, em processo (sem rede nem navegador) e com provedor simulado. |
| 2026-11-14 | 10 | Concorrência | `test/concurrency.test.ts`, 5 execuções seguidas sem falha: 40 mensagens simultâneas com limite de 3 (pico de exatamente 3 chamadas ao modelo, 40 concluídas, cada conversa com a sua resposta); 10 mensagens simultâneas na mesma conversa (1 aceita, 9 recusadas); 10 execuções canceladas duas vezes ao mesmo tempo (cada uma termina uma única vez; só 4 chegaram ao modelo); 12 respostas simultâneas a uma aprovação (1 aceita, arquivo escrito uma vez, 1 registro de auditoria). |
| 2026-11-14 | 10 | `npm run test:e2e` | 40 testes, 1 ignorado de propósito. 5 execuções completas depois das mudanças: 4 sem falha (as 3 últimas seguidas) e 1 com duas falhas simultâneas no início, nos dois roteiros que usam o servidor da porta 4393, ambas no limite de 20 s de espera. A causa não foi identificada; o padrão é o do congelamento descrito na seção 8. |
| 2026-11-14 | 10 | `npm audit` | `--omit=dev`: 0 vulnerabilidades. Completo: 13 avisos moderados antes, 11 depois de `npm audit fix`, todos em ferramentas de desenvolvimento (ver `SECURITY.md`, seção 10). |

**Não verificado na Fase 10:** a correção das guardas de requisição foi testada com `app.inject` e pelo E2E, não com um ataque montado a partir de outra página em um navegador. A revisão de segurança cobriu o servidor arquivo a arquivo nos pontos de controle; na interface, só o componente `Markdown` e uma varredura por padrões perigosos. `modules/providers/service.ts` e `modules/runs/repository.ts` foram lidos por trechos, não por inteiro. Nenhuma validação com modelo real nesta fase. O desempenho foi medido em processo, sem navegador; o tempo de desenho das telas com esse volume não foi medido. OpenAI e Anthropic reais continuam sem validação.

| 2026-11-14 | 9 | `npm run check` | Passou. Servidor: 19 arquivos, 406 testes; interface: 11 arquivos, 133 testes. |
| 2026-11-14 | 9 | `npm run test:e2e` | Passou: 40 testes, 1 ignorado de propósito. As duas últimas execuções completas, seguidas, sem falha. Antes delas, o roteiro de conversa falhou no desktop em 5 execuções seguidas por um defeito do próprio teste, corrigido (ver seção 8). Inclui, em desktop e celular: agente ocioso há uma hora na copa e inativo fora, com e sem redução de movimento; agente que sai pela porta da rua e volta pela recepção, andando e sem andar; posição igual depois de recarregar; delegação longa vista como visita à mesa do outro agente e a volta ao interromper. |
| 2026-11-14 | 9 | E2E: cena com 30 agentes | 30 agentes desativados de uma vez saem andando juntos: 59,9 a 60,0 quadros por segundo durante os 7,0 s de caminhada, em desktop e celular, em 7 execuções; maior intervalo entre quadros 17 a 33 ms. Chromium sem interface, nesta máquina. O teste falha abaixo de 20 quadros por segundo. |
| 2026-11-14 | 9 | `npm audit --omit=dev` | 0 vulnerabilidades. |
| 2026-11-14 | 9 | Manual: navegador | Em servidor à parte com dados descartáveis (porta 4396): dois agentes ociosos levantaram aos 2 minutos e foram da mesa à copa pela porta e pelo corredor (posições lidas a cada 0,5 s); Escritório conferido por captura em 1400 px e em 375 px, sem rolagem horizontal. |

**Não verificado na Fase 9:** o movimento não foi visto por uma pessoa: foi conferido por posições lidas da página, por capturas estáticas e pelos testes. A caminhada observada à mão ocorreu com o painel do navegador desenhando cerca de 1 quadro por segundo e, por um limite que existia no código, durou muito mais que os 7 s; o limite foi removido e o tempo correto é conferido pelo E2E, mas a observação manual não foi repetida depois da correção. Nada foi validado com modelo real nesta fase (a visita por delegação usa o provedor simulado). A medição de fluidez vale para o Chromium sem interface; outros navegadores e máquinas mais lentas não foram medidos. O ajuste de layout das áreas comuns no celular foi conferido por captura, não em aparelho real.

**Não verificado na Fase 8:** a qualidade das respostas do modelo local depois de usar ferramentas (na delegação real, o `llama3.2:3b` escreveu uma resposta final confusa, embora a ferramenta tenha funcionado; isso é do modelo, não da plataforma). Busca de URL contra a internet real (testada com servidor local e resolvedor de nomes substituído; as regras de bloqueio são as de produção). Ferramentas com OpenAI e Anthropic reais (adaptadores testados contra servidores simulados). Script: validado só por testes automatizados, não pela interface com modelo real. A linha de delegação entre mesas foi conferida por teste de componente e pelo E2E, não por captura de tela (a delegação real terminou em 0,1 s). Negar pela interface com modelo real.

**Não verificado na Fase 7:** item 4 do roteiro manual (reiniciar o servidor e conferir o histórico pela interface) não foi feito à mão; a persistência das conversas e a marcação de execuções interrompidas no reinício são cobertas por testes automatizados, e o E2E recarrega a página no meio de uma resposta. Limite de passos (só com ferramentas). OpenAI e Anthropic reais continuam sem validação. As animações do Escritório foram conferidas por classes e por capturas estáticas, não por inspeção do movimento. As duas conversas da validação ficaram no agente do banco real.

**Não verificado na Fase 6:** OpenAI e Anthropic reais (não há chave; os adaptadores foram testados contra servidores HTTP simulados que seguem cada protocolo), e a conversa pela interface, que só existe a partir da Fase 7. O provedor "Ollama local" criado na validação ficou configurado no banco real da aplicação.

**Não verificado na Fase 5:** reinício do servidor entre criar e reler um agente pela interface (a persistência em arquivo é coberta pelos testes de banco da Fase 3).

**Não verificado na Fase 4:** largura de 360 px exata (o perfil de celular testado tem 412 px), leitores de tela e navegadores além do Chromium.

**Não verificado na Fase 3:** encerramento por `Ctrl+C` em um terminal interativo (os processos de teste foram finalizados à força) e cobertura de código (a medição será configurada na Fase 10).

### Como os testes E2E funcionam

O Playwright sobe quatro servidores reais, cada um com um banco descartável em `apps/web/e2e/.e2e-data/`: um vazio (porta 4391), um com dados de exemplo (porta 4392), um que os testes podem alterar (porta 4393) e um só para o fluxo de ferramentas (porta 4395, `tools.spec.ts`; `office.spec.ts` usa o da porta 4393 e prepara os dados pela API), criados por `apps/server/scripts/prepare-e2e-data.ts`. Esse script apaga a pasta de dados que recebe e, por isso, recusa qualquer caminho que não contenha `.e2e-data`. Os dados de exemplo do servidor da porta 4392 são inseridos direto no banco e incluem duas execuções deixadas ativas de propósito: ao iniciar, o servidor precisa marcá-las como interrompidas (RN-12), e os testes conferem isso. O fluxo de conversa (`chat.spec.ts`) cria tudo pela interface no servidor da porta 4393.

Um quarto processo (`apps/web/e2e/fake-provider.mjs`, porta 4394) faz o papel de provedor de modelos, falando o suficiente dos protocolos do Ollama e da OpenAI. Os servidores de teste rodam com `SECRET_STORE=memory`, para não gravar chaves de teste no cofre real.

Nos testes do servidor, os adaptadores são exercitados contra servidores HTTP reais em portas livres (`apps/server/test/stub-servers.ts`), não contra objetos simulados: assim o que se testa é a leitura do protocolo de verdade.

## 8. Problemas conhecidos

| Data | Descrição | Estado |
|---|---|---|
| 2026-11-15 | **Migração que reconstrói tabela apagava dados em cascata.** Encontrado ao subir a aplicação sobre o banco real depois da Fase 13: a migração `0002` reconstrói `providers` (cria a nova, copia, apaga a antiga, renomeia). O `PRAGMA foreign_keys=OFF` que ela traz não tem efeito dentro de uma transação, e o migrador do Drizzle roda tudo numa só; o `DROP TABLE` fazia então um `DELETE` implícito com as chaves ligadas, que descia em cascata para `models`. No banco real, um agente usava um modelo e a regra `restrict` barrou tudo (a transação foi desfeita, nada se perdeu). Num banco com provedores e sem agentes nos modelos, a migração teria passado **apagando todos os modelos**. Os testes não pegaram porque migram bancos vazios. | Corrigido em `runMigrations`: as chaves estrangeiras ficam desligadas na conexão enquanto as migrações rodam, `PRAGMA foreign_key_check` confere o resultado e o servidor não inicia se houver referência quebrada. Teste de regressão em `test/db.test.ts`, que migra até a `0001`, insere dados e aplica a `0002`, nos dois casos (falhava em um e apagava os modelos no outro antes da correção). Depois da correção, a aplicação subiu sobre o banco real com o provedor, o modelo e os dois agentes intactos. |
| 2026-11-15 | Roteiros E2E do Escritório frágeis, encontrados na Fase 11: a preparação de dados pela API podia rodar antes de a página abrir a sessão (401), e um único pedido de nova leitura era ignorado se os dados da tela tivessem menos de 2 s. | Corrigido no roteiro: a preparação refaz a sessão e tenta de novo; o pedido é repetido até a tela mostrar a mudança. |
| 2026-11-15 | Na Fase 11, 1 de 4 execuções finais do E2E falhou em `chat.spec.ts` (celular), em uma verificação de visibilidade. Não reproduzido nem investigado. | Aberto. |
| 2026-11-14 | Na Fase 10, 1 de 5 execuções do E2E teve duas falhas simultâneas no início (`agents.spec.ts` e `chat.spec.ts`, desktop, servidor da porta 4393), cada uma em uma verificação que esperou os 20 s. As outras 4 passaram inteiras. Mesmo padrão do congelamento de processo Node descrito abaixo; a causa continua sem identificação. | Aberto. |
| 2026-11-14 | Defeito no roteiro E2E de conversa, exposto na Fase 9: ao reabrir o histórico, o teste clicava em "Conversas (n)", que só existe em tela estreita, sem limite de tempo; no desktop, se a lista ainda não estivesse desenhada no instante da checagem, o clique esperava até o teste estourar 30 s. Passava sozinho e falhava sempre que rodava junto com outro roteiro no servidor da porta 4393 (com `agents.spec.ts` ou com o novo `office.spec.ts`). Por que a lista passou a chegar depois da checagem nesta fase não foi investigado. | Corrigido: o clique tem limite de 1 s e a tentativa se repete. |
| 2026-11-12 | **Testes E2E instáveis com muitos navegadores em paralelo.** Com 8 navegadores simultâneos nesta máquina, carregamentos de página travavam por 10 a 30 s. O mesmo aconteceu contra um servidor HTTP mínimo do Node, sem nenhum código do projeto (8 falhas em 40), e não aconteceu com 2 navegadores (40 de 40). Durante as falhas, o servidor da aplicação chegou a ficar 10 a 18 s preso dentro da chamada do sistema operacional que fecha uma conexão TCP; um teste de carga com 360 requisições simultâneas feitas pelo Node não reproduziu o travamento. A causa não foi identificada: a evidência aponta para o ambiente (Windows 11 build 26300 ou software de rede/segurança), não para o código. | Contornado com `workers: 2` no Playwright. Reavaliar na Fase 7, quando houver conexões longas de streaming, e na Fase 10. Se o travamento aparecer em uso normal, passa a ser defeito a corrigir. |
| 2026-11-13 | **Processo Node congela por cerca de 10 s durante o E2E.** Na Fase 7, com o tempo de espera padrão de 5 s, o E2E falhava em parte das execuções (2 das 3 primeiras). Com um monitor do laço de eventos em todos os processos Node, 17 execuções dos dois roteiros que compartilham o servidor da porta 4393 tiveram 2 congelamentos, de 9,6 e 9,7 s, os dois no processo do provedor simulado (`fake-provider.mjs`, um servidor HTTP do Node sem código do projeto) e nenhum no servidor da aplicação. Outras 12 execuções com um perfilador de CPU ligado não tiveram nenhum. As duas primeiras falhas, antes do monitor, atingiram dois testes ao mesmo tempo e podem ter sido no servidor da aplicação: isso não foi medido. Tentativas de reproduzir fora do Playwright (servidor mínimo com SSE; 100 conexões derrubadas, 150 requisições em streaming abortadas, 50 páginas abertas e fechadas) não produziram nenhum atraso. É o mesmo sintoma registrado na Fase 4, agora com apenas 2 navegadores. | **Causa não identificada.** Contorno: as verificações do E2E esperam até 20 s (`playwright.config.ts`); com isso, 3 execuções completas seguidas passaram. Não há evidência de que afete o uso normal (a conversa real com o Ollama respondeu em frações de segundo), mas também não está descartado. Reavaliar na Fase 10, de preferência em outra máquina. |
| 2026-11-13 | Interferência entre roteiros E2E que compartilham servidor, encontrada na Fase 8: o fluxo de ferramentas gerava execuções suficientes para tirar do feed do Painel a atividade que o fluxo de conversa conferia; e um perfil via por um instante o provedor que o outro acabara de excluir (404 ao ler os modelos). | Corrigido: o fluxo de ferramentas tem servidor próprio (porta 4395) e o detector de problemas ignora só aquele 404 específico. Também foi corrigida uma corrida antiga no fluxo de conversa (a lista de conversas no celular abre sozinha e um clique às cegas podia fechá-la). |
| 2026-11-13 | Defeito encontrado pelos testes da Fase 8 e corrigido antes de existir em uso: a regra que bloqueava IPv4 embutido em IPv6 bloqueava também todo endereço IPv4. | Corrigido, com teste. |
| 2026-11-13 | Defeitos encontrados na validação visual da Fase 7 e corrigidos: o balão do Escritório cortava o texto e escondia a ponta; marcas desenhadas como texto dentro do SVG entravam no nome lido de cada mesa. | Corrigido, com teste. |
| 2026-11-12 | Defeitos encontrados pelos testes E2E da Fase 6 e corrigidos: a contagem de agentes de um provedor não atualizava logo após criar um agente; ao excluir um provedor, a tela ainda pedia os modelos dele e recebia 404. | Corrigido. |
| 2026-11-12 | Defeito encontrado e corrigido: ids gerados no mesmo milissegundo não eram ordenados, e a "última execução" de um agente podia ser escolhida errada. Agora os ids são monotônicos, com teste. | Corrigido. |
