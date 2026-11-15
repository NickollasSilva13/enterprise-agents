# SPEC — Especificação funcional e técnica

> Nome de trabalho do projeto: **Enterprise Agents** (derivado da pasta; pode ser trocado sem impacto técnico).
> Estado deste documento: atualizado na Fase 7. É revisto ao fim de cada fase.

## 1. Objetivos

Plataforma **local** para criar, configurar, executar, monitorar e orquestrar agentes de IA por meio de uma interface gráfica, sem depender de serviços em nuvem para as funções essenciais.

- O usuário tem controle total: dados, agentes e credenciais ficam na própria máquina.
- Os agentes funcionam com modelos locais (Ollama) ou externos (OpenAI, Anthropic, compatíveis).
- Toda ação potencialmente perigosa de um agente é controlada por permissões aplicadas no backend.
- A arquitetura permite evoluir para múltiplos agentes cooperando, sem reescrita.

**Fora de escopo:** multiusuário, acesso remoto, hospedagem em nuvem, treinamento de modelos, marketplace de agentes.

## 2. Decisões de produto aprovadas (Fase 1)

| # | Decisão |
|---|---|
| D1 | Motor de agentes próprio (loop modelo → ferramenta → modelo) sobre uma interface de provedores. |
| D2 | Painel profissional como interface principal, mais uma visão "Escritório" espacial com arte própria. Em 2026-11-12 o usuário pediu que o Escritório seja amigável e pareça um escritório de verdade (móveis, agentes sentados às mesas, animações de estado), a ser construído nas fases seguintes; ver RF-07 a RF-09. No mesmo dia pediu também personagens andando entre salas e áreas comuns, em fase própria; ver RF-80. |
| D3 | Aplicação web local, aberta no navegador. Instalador desktop fica como melhoria futura. |
| D4 | TypeScript de ponta a ponta. |
| D5 | Interface e documentação em português; código e identificadores em inglês. |

## 3. Glossário

| Termo | Significado |
|---|---|
| Agente | Entidade persistida: nome, objetivo, prompt de sistema, modelo, parâmetros, ferramentas e limites. |
| Provedor | Serviço que expõe modelos (Ollama, OpenAI-compatível, Anthropic). |
| Conversa | Sequência de mensagens entre o usuário e um agente. |
| Execução (`run`) | Uma rodada de trabalho do agente, disparada por uma mensagem ou por delegação. |
| Passo (`run_step`) | Evento dentro de uma execução: chamada ao modelo, chamada de ferramenta, aprovação, erro. |
| Ferramenta | Capacidade que o agente pode invocar (ler arquivo, buscar URL, delegar etc.). |
| Aprovação | Decisão humana (aprovar/negar) exigida antes de uma ação crítica. |
| Projeto | Agrupador de agentes; corresponde a uma "sala" na visão Escritório. |

## 4. Requisitos funcionais

A coluna **Fase** indica quando o requisito é entregue.

### 4.1 Dashboard

| ID | Requisito | Fase |
|---|---|---|
| RF-01 | Exibir total de agentes e a contagem por estado (ativo, inativo, com falha). | 4 |
| RF-02 | Exibir execuções em andamento e as que aguardam aprovação. | 4 (dados reais a partir da 7) |
| RF-03 | Exibir histórico recente de execuções com estado e duração. | 7 |
| RF-04 | Exibir feed das últimas atividades dos agentes em linguagem natural. | 7 |
| RF-05 | Exibir indicadores: taxa de sucesso, duração média, tokens consumidos (quando o provedor informar). | 7 |
| RF-06 | Exibir alertas: falhas, aprovações pendentes, provedor inacessível. | 7 |
| RF-07 | Visão "Escritório": projetos como salas, agentes com estado ao vivo. | 4 (planta baixa) / 7 (ao vivo) |
| RF-08 | Escritório ilustrado: cada sala com piso, mesas, cadeiras, computadores e objetos; cada agente sentado à sua mesa, com animação conforme o estado (trabalhando, aguardando você com a mão levantada, com falha, ocioso, ausente quando inativo) e um balão com a atividade atual. Clicar no agente abre a conversa. Arte original em SVG, sem recursos externos. | 7 |
| RF-09 | Interação entre agentes visível no Escritório: delegações mostradas entre as mesas e aprovação de ações a partir do próprio agente. | 8 |

Consumo de CPU/memória do processo é exibido apenas se disponível; consumo por agente não é medido (ver Limitações).

### 4.2 Gerenciamento de agentes

| ID | Requisito | Fase |
|---|---|---|
| RF-10 | Criar, editar e excluir agentes. | 5 |
| RF-11 | Ativar e desativar agentes. | 5 |
| RF-12 | Duplicar um agente. | 5 |
| RF-13 | Configurar nome, descrição, objetivo, projeto e prompt de sistema. | 5 |
| RF-14 | Selecionar o modelo e os parâmetros (temperatura, máximo de tokens). | 5 (seleção real na 6) |
| RF-15 | Definir limites de execução: tempo, número de passos, tokens. | 5 |
| RF-16 | Definir ferramentas disponíveis e o nível de permissão de cada uma. | 8 |
| RF-17 | Visualizar o estado atual do agente. | 5 |
| RF-18 | Executar manualmente e interromper execuções. Executar é enviar uma mensagem ao agente pelo chat; interromper está no chat e na página da execução. | 7 |
| RF-19 | Consultar o histórico de atividades do agente: suas conversas e a lista de execuções filtrada por ele. | 7 |
| RF-20 | Exportar e importar agentes em JSON (sem segredos). | 11 |

### 4.3 Interação com agentes

| ID | Requisito | Fase |
|---|---|---|
| RF-30 | Chat individual com cada agente. | 7 |
| RF-31 | Resposta exibida em tempo real (streaming). | 7 |
| RF-32 | Histórico de conversas persistido e navegável. | 7 |
| RF-33 | Linha do tempo dos passos da execução (modelo, ferramenta, aprovação, erro). | 7 |
| RF-34 | Exibição de erros e logs da execução. | 7 |
| RF-35 | Interromper a execução em andamento. | 7 |
| RF-36 | Enviar nova instrução após interromper ou concluir, na mesma conversa. | 7 |

### 4.4 Provedores e modelos

| ID | Requisito | Fase |
|---|---|---|
| RF-40 | Cadastrar, editar e remover provedores (Ollama, OpenAI-compatível, Anthropic). | 6 |
| RF-41 | Armazenar a credencial no cofre do sistema; nunca exibi-la de volta. | 6 |
| RF-42 | Testar a conexão de um provedor. | 6 |
| RF-43 | Listar os modelos disponíveis no provedor e habilitá-los para uso. | 6 |
| RF-44 | Sinalizar provedores externos e informar quais dados são enviados a eles. | 6 |

### 4.5 Ferramentas, permissões e aprovação

| ID | Requisito | Fase |
|---|---|---|
| RF-50 | Registro extensível de ferramentas com esquema de entrada validado. | 8 |
| RF-51 | Ferramentas iniciais: ler arquivo, listar pasta, escrever arquivo, buscar URL, delegar a agente. | 8 |
| RF-52 | Ferramenta de execução de script, desligada por padrão. | 8 |
| RF-53 | Permissão por agente e por ferramenta: bloqueada, exige aprovação, permitida. | 8 |
| RF-54 | Fila de aprovações pendentes com aprovar/negar e exibição dos argumentos. | 8 |
| RF-55 | Pasta de trabalho por agente; acesso a arquivos restrito a ela. | 8 |

### 4.6 Orquestração

| ID | Requisito | Fase |
|---|---|---|
| RF-60 | Um agente coordenador delega tarefas a agentes especializados. | 8 |
| RF-61 | Execuções filhas ligadas à execução de origem (árvore). | 8 |
| RF-62 | Visualizar a árvore de execução e o agente responsável por cada ação. | 8 |
| RF-63 | Limite de profundidade de delegação e proteção contra ciclos. | 8 |

Fluxos de trabalho declarativos (grafo de tarefas, paralelismo configurável) são **planejados** e não fazem parte do escopo inicial.

### 4.7 Logs e monitoramento

| ID | Requisito | Fase |
|---|---|---|
| RF-70 | Registrar cada passo de execução com horário, duração e estado. | 7 |
| RF-71 | Tela de logs com filtro por agente, estado e período. | 7 |
| RF-72 | Trilha de auditoria de operações sensíveis. | 6 (início) / 8 (completa) |
| RF-73 | Remover segredos de qualquer registro. | 6 |

### 4.8 Escritório vivo

| ID | Requisito | Fase |
|---|---|---|
| RF-80 | Personagens andam entre as salas e as áreas comuns (recepção e copa) conforme o estado: ocioso vai à copa, inativo sai do escritório, delegação aparece como visita à mesa do outro agente. Respeita a preferência de reduzir movimento. | 9 |

## 5. Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Roda localmente em Windows 10/11; macOS e Linux são suportados pela stack, mas validados só se houver ambiente. |
| RNF-02 | Instalação com `npm install`; inicialização com `npm start`. Sem Docker obrigatório. |
| RNF-03 | O servidor escuta apenas em `127.0.0.1`. |
| RNF-04 | Persistência em SQLite local; esquema versionado por migrações. |
| RNF-05 | Configuração centralizada, por variáveis de ambiente validadas na inicialização. |
| RNF-06 | Credenciais fora do banco e fora do `.env`, no cofre do sistema operacional. |
| RNF-07 | TypeScript em modo estrito; entradas validadas com Zod nas bordas. |
| RNF-08 | Erros de API em formato único (`code`, `message`, `details`). |
| RNF-09 | A primeira parte da resposta do agente aparece na tela assim que o provedor a emite. |
| RNF-10 | Interface utilizável a partir de 360 px de largura. |
| RNF-11 | Reiniciar o servidor não corrompe dados; execuções interrompidas pelo desligamento são marcadas como tal. |
| RNF-12 | Todo elemento de interface tem função real ou está marcado como "planejado". |

## 6. Casos de uso principais

**UC-01 — Configurar um provedor.** O usuário abre Modelos, adiciona um provedor, informa a URL e (se preciso) a chave, testa a conexão e habilita os modelos desejados. Se o provedor for externo, a tela informa o que será enviado.

**UC-02 — Criar um agente.** O usuário abre Agentes, preenche nome, objetivo, prompt de sistema, escolhe modelo e limites, e salva. O agente aparece na lista como ativo e ocioso.

**UC-03 — Conversar com um agente.** O usuário abre o chat do agente e envia uma mensagem. Uma execução é criada, a resposta aparece em streaming e os passos ficam visíveis na linha do tempo.

**UC-04 — Interromper uma execução.** Durante a execução, o usuário clica em Interromper. A chamada ao modelo e as ferramentas em curso são canceladas e a execução fica como "cancelada", preservando o que já foi produzido.

**UC-05 — Aprovar uma ação crítica.** O agente pede uma ferramenta que exige aprovação. A execução pausa, o agente aparece como "aguardando você", e o usuário vê a ferramenta e os argumentos. Ao aprovar, a ferramenta roda; ao negar, o agente recebe a negativa como resultado e continua.

**UC-06 — Delegar a outro agente.** Um coordenador chama a ferramenta de delegação. Uma execução filha é criada para o agente especialista e o resultado volta ao coordenador. A árvore fica visível.

**UC-07 — Investigar uma falha.** O usuário vê o alerta no dashboard, abre a execução e encontra o passo com erro, a mensagem e o contexto.

## 7. Regras de negócio

| ID | Regra |
|---|---|
| RN-01 | Agente inativo não inicia execuções, nem manuais nem por delegação. |
| RN-02 | Um agente só executa se tiver um modelo habilitado de um provedor configurado. |
| RN-03 | Ferramenta não concedida explicitamente ao agente é bloqueada (negação por padrão). |
| RN-04 | A decisão de permissão é tomada no backend a cada chamada; o prompt não a altera. |
| RN-05 | Execução que excede tempo, passos ou tokens é encerrada com estado `timed_out` ou `failed` e motivo registrado. |
| RN-06 | Cada conversa tem no máximo uma execução ativa por vez. |
| RN-07 | Excluir um agente com execução ativa exige interrompê-la antes. O histórico é preservado e passa a referenciar o agente como excluído. |
| RN-08 | Excluir um provedor em uso por agentes é bloqueado até que os agentes sejam reconfigurados. |
| RN-09 | Aprovação pendente não expira sozinha, mas é negada automaticamente se a execução for cancelada. |
| RN-10 | Delegação respeita profundidade máxima configurável (padrão 3) e não permite ciclo na cadeia. |
| RN-11 | Segredos nunca aparecem em respostas de API, logs ou exportações. |
| RN-12 | Ao iniciar, o servidor marca como `interrupted` as execuções que estavam ativas quando ele parou. |

**Estados de execução:** `queued` → `running` ⇄ `waiting_approval` → `completed` | `failed` | `cancelled` | `timed_out` | `interrupted`.

**Estado exibido do agente** (derivado): inativo; ocioso; trabalhando; aguardando você; com falha (última execução falhou).

## 8. Critérios de aceite

Coincidem com os critérios de conclusão do projeto:

1. A aplicação instala e inicia com os comandos documentados em uma máquina limpa com Node 22.
2. É possível criar, editar, duplicar, desativar e excluir um agente, e os dados sobrevivem a um reinício.
3. É possível configurar ao menos um provedor local (Ollama) e conversar com um agente com resposta em streaming.
4. É possível interromper uma execução em andamento.
5. Cada execução tem passos, durações e erros consultáveis na interface.
6. Uma ferramenta não concedida não executa, mesmo que o modelo a solicite; uma ferramenta "exige aprovação" não executa sem a decisão do usuário.
7. Um agente não consegue ler nem escrever fora da sua pasta de trabalho.
8. Nenhuma chave de API aparece no banco, nas respostas da API ou nos logs.
9. O servidor recusa requisições com `Host` ou `Origin` inesperados.
10. As suítes de teste descritas em `TESTING.md` passam, e as falhas conhecidas estão documentadas.

## 9. Limitações conhecidas

- **Isolamento de scripts.** Sem Docker ou VM, um script executado por um agente roda com os privilégios do usuário. Por isso a ferramenta nasce desligada e sempre exige aprovação. Isolamento por contêiner é melhoria futura.
- **Consumo de recursos por agente.** Não há medição de CPU/memória por agente, pois os modelos rodam fora do processo (Ollama ou API). São exibidos tokens e duração.
- **Custo estimado.** Depende de o provedor informar o uso de tokens e de uma tabela de preços mantida manualmente; pode divergir da cobrança real.
- **Usuário único.** Não há contas nem perfis. Quem acessa a máquina com o usuário do sistema acessa a aplicação.
- **Temperatura com a Anthropic.** Os modelos atuais da Anthropic recusam parâmetros de amostragem, então a temperatura configurada no agente não é enviada a esse provedor.
- **Suporte a ferramentas em serviços compatíveis com OpenAI.** O protocolo não informa quais modelos aceitam ferramentas; eles aparecem como "só conversa" até que o usuário marque, na tela Modelos, que o modelo aceita ferramentas.
- **Chamada de ferramentas em modelos locais.** Nem todo modelo do Ollama suporta ferramentas; nesses casos o agente funciona apenas como chat.
- **Scripts só em Node.js.** A ferramenta de script executa arquivos `.js`, `.mjs` e `.cjs`; scripts Python não são suportados.
- **Memória de ferramentas entre mensagens.** Dentro de uma mesma resposta o agente vê os resultados das ferramentas que usou; nas mensagens seguintes ele vê só o que escreveu, não os resultados brutos.
- **Execução manual.** Executar um agente é enviar uma mensagem no chat; não há botão de execução sem conversa.
- **Tamanho da conversa.** O histórico inteiro é enviado ao modelo a cada mensagem. Conversas muito longas podem passar da janela de contexto do modelo; não há corte nem resumo automático.
- **Formatação das respostas.** As respostas são exibidas como Markdown básico (negrito, listas, código, citações, links). Tabelas não são formatadas e imagens não são carregadas, por segurança.
- **Tokens de execuções interrompidas.** Os provedores informam o uso de tokens só ao fim da resposta; uma execução interrompida ou que falha no meio fica com contagem zero.
- **Taxa de sucesso.** É a fração de execuções concluídas entre as encerradas; uma execução interrompida por você conta como não concluída.
- **Aplicação de referência.** A área logada do Habblaude não foi analisada; nada do seu funcionamento interno foi presumido.
