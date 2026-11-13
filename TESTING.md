# TESTING — Estratégia de testes

> Estado: Fase 6. Existem testes unitários, de API, de persistência, de segurança (C-01 a C-06), de componente e ponta a ponta. `test:perf` ainda não existe. A seção 7 registra apenas resultados de testes realmente executados.

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
| Concorrência | Vitest | Execuções simultâneas, limite global, uma execução por conversa. | `apps/server/test/runtime/` |
| Desempenho | Script dedicado | Tempos de resposta da API e do streaming com volume de dados. | `apps/server/test/perf/` |
| Manual com modelo real | Roteiro | Conversa real com Ollama (e provedor externo, se configurado). | seção 6 |

### Provedor simulado

Um adaptador `FakeProvider` implementa `ModelProvider` e reproduz roteiros determinísticos: texto em trechos, chamada de ferramenta, erro, resposta lenta, resposta que nunca termina. É a base dos testes de runtime e E2E.

## 3. Como executar

| Comando | Efeito |
|---|---|
| `npm test` | Unitários, integração e componentes. |
| `npm run test:e2e` | Compila a interface e roda os testes ponta a ponta (Playwright, Chromium) em desktop e celular. Não faz parte do `check`. |
| `npm run test:perf` | Desempenho. *(Fase 10)* |
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
| C-06 | Entradas inválidas ou grandes demais retornam erro de validação, não erro interno. |
| C-07 | Saída de modelo com `<script>` ou atributos de evento não executa na interface. |
| C-08, C-09 | Após salvar um provedor, a chave não está no banco nem em nenhuma resposta da API. |
| C-10 | Erro de provedor contendo a chave é registrado com a chave removida. |
| C-13 | Execução que excede tempo, passos ou tokens é encerrada com o estado correto. |
| C-14 | Cancelar interrompe a chamada ao modelo e a ferramenta em curso. |
| C-15 | Ferramenta não concedida não executa, mesmo solicitada pelo modelo. |
| C-16 | Ferramenta `ask` não executa antes da decisão; negada, não executa nunca. |
| C-17 | `..`, caminho absoluto, link simbólico para fora e nomes reservados são recusados. |
| C-19 | URLs para `127.0.0.1`, `localhost`, `10.x`, `192.168.x`, `169.254.169.254`, IPv6 local e redirecionamento para esses destinos são recusadas. |
| C-20 | Com a ferramenta de script desligada, não há execução; ligada, não aceita `allow`. |
| C-21 | Delegação além da profundidade máxima ou em ciclo é recusada. |

## 5. Cobertura esperada e critérios de aprovação

| Área | Meta de cobertura de linhas |
|---|---|
| `security/`, `tools/`, `PermissionEngine` | ≥ 90% |
| `runtime/` | ≥ 85% |
| Demais módulos do servidor | ≥ 80% |
| Interface | Sem meta numérica; fluxos críticos cobertos por E2E. |

Uma fase é aprovada quando:

1. `npm run check` passa sem erros.
2. `npm run test:e2e` passa.
3. Os testes de segurança dos controles entregues na fase passam.
4. Falhas remanescentes estão descritas em "Problemas conhecidos", com justificativa.

## 6. Roteiro manual com modelo real

Executado nas Fases 6, 7 e 8, e registrado na seção 7 com data e modelo usado:

1. Configurar o Ollama, testar a conexão e habilitar um modelo.
2. Criar um agente e conversar; confirmar streaming.
3. Interromper uma resposta longa.
4. Reiniciar o servidor e confirmar o histórico.
5. (Fase 8) Conceder uma ferramenta com `ask`, aprovar e negar.
6. (Fase 8) Delegar de um coordenador a um especialista.

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

**Não verificado na Fase 6:** OpenAI e Anthropic reais (não há chave; os adaptadores foram testados contra servidores HTTP simulados que seguem cada protocolo), e a conversa pela interface, que só existe a partir da Fase 7. O provedor "Ollama local" criado na validação ficou configurado no banco real da aplicação.

**Não verificado na Fase 5:** reinício do servidor entre criar e reler um agente pela interface (a persistência em arquivo é coberta pelos testes de banco da Fase 3).

**Não verificado na Fase 4:** largura de 360 px exata (o perfil de celular testado tem 412 px), leitores de tela e navegadores além do Chromium.

**Não verificado na Fase 3:** encerramento por `Ctrl+C` em um terminal interativo (os processos de teste foram finalizados à força) e cobertura de código (a medição será configurada na Fase 10).

### Como os testes E2E funcionam

O Playwright sobe três servidores reais, cada um com um banco descartável em `apps/web/e2e/.e2e-data/`: um vazio (porta 4391), um com dados de exemplo (porta 4392) e um que os testes podem alterar (porta 4393), criados por `apps/server/scripts/prepare-e2e-data.ts`. Esse script apaga a pasta de dados que recebe e, por isso, recusa qualquer caminho que não contenha `.e2e-data`. Os dados de exemplo do servidor da porta 4392 são inseridos direto no banco, porque incluem execuções, que ainda não podem ser criadas pela interface.

Um quarto processo (`apps/web/e2e/fake-provider.mjs`, porta 4394) faz o papel de provedor de modelos, falando o suficiente dos protocolos do Ollama e da OpenAI. Os servidores de teste rodam com `SECRET_STORE=memory`, para não gravar chaves de teste no cofre real.

Nos testes do servidor, os adaptadores são exercitados contra servidores HTTP reais em portas livres (`apps/server/test/stub-servers.ts`), não contra objetos simulados: assim o que se testa é a leitura do protocolo de verdade.

## 8. Problemas conhecidos

| Data | Descrição | Estado |
|---|---|---|
| 2026-11-12 | **Testes E2E instáveis com muitos navegadores em paralelo.** Com 8 navegadores simultâneos nesta máquina, carregamentos de página travavam por 10 a 30 s. O mesmo aconteceu contra um servidor HTTP mínimo do Node, sem nenhum código do projeto (8 falhas em 40), e não aconteceu com 2 navegadores (40 de 40). Durante as falhas, o servidor da aplicação chegou a ficar 10 a 18 s preso dentro da chamada do sistema operacional que fecha uma conexão TCP; um teste de carga com 360 requisições simultâneas feitas pelo Node não reproduziu o travamento. A causa não foi identificada: a evidência aponta para o ambiente (Windows 11 build 26300 ou software de rede/segurança), não para o código. | Contornado com `workers: 2` no Playwright. Reavaliar na Fase 7, quando houver conexões longas de streaming, e na Fase 10. Se o travamento aparecer em uso normal, passa a ser defeito a corrigir. |
| 2026-11-12 | Defeitos encontrados pelos testes E2E da Fase 6 e corrigidos: a contagem de agentes de um provedor não atualizava logo após criar um agente; ao excluir um provedor, a tela ainda pedia os modelos dele e recebia 404. | Corrigido. |
| 2026-11-12 | Defeito encontrado e corrigido: ids gerados no mesmo milissegundo não eram ordenados, e a "última execução" de um agente podia ser escolhida errada. Agora os ids são monotônicos, com teste. | Corrigido. |
