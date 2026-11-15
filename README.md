# Enterprise Agents

Plataforma local para criar, configurar, executar e monitorar agentes de IA por uma interface gráfica. Roda inteiramente na sua máquina, com modelos locais (Ollama) ou externos (OpenAI, Anthropic e compatíveis).

> **Estado do projeto:** as onze fases estão concluídas. É possível cadastrar agentes e projetos, conectar provedores de modelos, conversar com cada agente com a resposta em tempo real, liberar ferramentas por agente (arquivos, busca na web, delegação, scripts), aprovar ou negar ações, exportar e importar agentes, e acompanhar tudo no painel, nos logs e no escritório. O que ficou sem verificação está em [ROADMAP.md](ROADMAP.md), "Pendências ao final do projeto". Para aprender a usar, comece pelo [guia de utilização](docs/GUIA.md).

## Funcionalidades

Cada uma é marcada como disponível quando é entregue.

| Funcionalidade | Fase | Disponível |
|---|---|---|
| Painel com estado dos agentes, execuções, atividade e alertas, ao vivo | 4 / 7 | Sim |
| Escritório ilustrado: salas, agentes às mesas, animação por estado; clique para conversar | 4 / 7 | Sim |
| Escritório vivo: recepção e copa; agentes que andam, vão à copa quando ociosos, saem quando inativos e visitam a mesa do colega ao delegar | 9 | Sim |
| Criar, editar, duplicar, ativar e excluir agentes; projetos | 5 | Sim |
| Provedores e modelos (Ollama, OpenAI-compatível, Anthropic) | 6 | Sim (OpenAI e Anthropic ainda não validados com o serviço real) |
| Chat com streaming, histórico e interrupção | 7 | Sim (validado com o Ollama) |
| Logs e linha do tempo das execuções | 7 | Sim |
| Ferramentas com permissões por agente e aprovação humana | 8 | Sim (validado com o Ollama) |
| Delegação entre agentes, com árvore de execução | 8 | Sim (validado com o Ollama) |
| Exportar e importar agentes em JSON, sem segredos | 11 | Sim |

## Pré-requisitos

- Node.js 22 ou superior e npm 10 ou superior.
- Windows 10/11 (plataforma de desenvolvimento e validação). macOS e Linux são suportados pela stack, mas não validados.
- Opcional: [Ollama](https://ollama.com) para modelos locais, com ao menos um modelo baixado (por exemplo, `ollama pull llama3.2:3b`).
- Docker **não** é necessário.

## Instalação

```bash
npm install
```

## Configuração

Opcional. Para mudar algum padrão, copie `.env.example` para `.env` e ajuste. Valores inválidos impedem a inicialização, com uma mensagem que aponta a variável.

| Variável | Padrão | Descrição |
|---|---|---|
| `APP_PORT` | `4317` | Porta do servidor local. |
| `DATA_DIR` | `./data` | Pasta do banco e das pastas de trabalho dos agentes. |
| `LOG_LEVEL` | `info` | Nível de log do servidor. |
| `MAX_CONCURRENT_RUNS` | `4` | Execuções simultâneas; o excedente espera na fila. |
| `MAX_DELEGATION_DEPTH` | `3` | Quantos níveis uma cadeia de delegação entre agentes pode ter. |
| `WEB_DEV_PORT` | `5173` | Porta da interface no modo de desenvolvimento. |

O servidor sempre escuta em `127.0.0.1`; isso não é configurável, por segurança.

**Chaves de API não vão no `.env`.** Elas são informadas na tela Modelos e guardadas no cofre de credenciais do sistema operacional. Veja [SECURITY.md](SECURITY.md).

## Inicialização

```bash
npm start
```

O comando compila a interface, cria o banco em `data/app.db` se ele não existir, aplica as migrações e inicia o servidor. Depois abra `http://127.0.0.1:4317` no navegador. Para encerrar, pressione `Ctrl+C` no terminal.

Modo de desenvolvimento, com recarga automática (interface em `http://127.0.0.1:5173`):

```bash
npm run dev
```

Verificação completa (tipos, lint e testes):

```bash
npm run check
```

Testes ponta a ponta no navegador (na primeira vez, instale o navegador de teste com `npx playwright install chromium`):

```bash
npm run test:e2e
```

## Ferramentas e aprovações

Um agente começa sem nenhuma ferramenta. Na tela **Ferramentas**, escolha o agente e marque cada ferramenta como bloqueada, "pede aprovação" ou permitida:

| Ferramenta | O que faz | Risco |
|---|---|---|
| Ler arquivo, Listar pasta | Leem a pasta de trabalho do agente. | Baixo |
| Escrever arquivo | Cria ou substitui arquivos na pasta de trabalho do agente. | Médio |
| Buscar URL | Lê páginas públicas da internet; endereços desta máquina e da rede local são bloqueados. | Médio |
| Delegar a agente | Passa uma tarefa a outro agente, que usa as próprias permissões. | Médio |
| Executar script | Roda um script Node.js da pasta de trabalho. Desligada por padrão e sempre com aprovação. | Alto |

Cada agente tem a sua pasta, em `data/workspaces/<id do agente>` (o caminho aparece na tela). Quando um agente pede uma ferramenta marcada como "pede aprovação", a execução para e o pedido aparece na conversa, na tela **Aprovações** e na mesa do agente no Escritório, com os argumentos exatos. O modelo precisa aceitar ferramentas: no Ollama isso é detectado; em serviços compatíveis com OpenAI, marque o modelo na tela Modelos.

## Estrutura do projeto

```
apps/server      API, runtime de agentes, banco, segurança
apps/web         Interface React
packages/shared  Tipos e esquemas compartilhados
data/            Banco e pastas de trabalho (não versionado)
```

## Documentação

| Documento | Conteúdo |
|---|---|
| [docs/GUIA.md](docs/GUIA.md) | Guia de utilização, passo a passo. |
| [SPEC.md](SPEC.md) | Requisitos, casos de uso, regras de negócio, critérios de aceite. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes, fluxos de dados, persistência. |
| [SECURITY.md](SECURITY.md) | Modelo de ameaças, controles, segredos, permissões. |
| [TESTING.md](TESTING.md) | Estratégia de testes e registro de execuções. |
| [ROADMAP.md](ROADMAP.md) | Fases e andamento. |
| [CLAUDE.md](CLAUDE.md) | Instruções permanentes para o Claude Code. |

## Privacidade

Com modelos locais, nada sai da sua máquina. Ao usar um provedor externo, o prompt de sistema e o objetivo do agente, todas as mensagens da conversa (suas e do agente), a descrição das ferramentas liberadas e os resultados delas (o conteúdo de um arquivo lido, o texto de uma página buscada, a resposta de outro agente) são enviados a esse provedor a cada mensagem. A interface sinaliza isso ao cadastrar o provedor, ao escolher o modelo do agente e na própria tela de conversa. Chaves de API nunca são enviadas ao modelo.
