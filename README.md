# Enterprise Agents

Plataforma local para criar, configurar, executar e monitorar agentes de IA por uma interface gráfica. Roda inteiramente na sua máquina, com modelos locais (Ollama) ou externos (OpenAI, Anthropic e compatíveis).

> **Estado do projeto:** Fase 6 concluída (integração com modelos de IA). Já é possível cadastrar agentes e projetos, conectar provedores de modelos e escolher o modelo de cada agente. Ainda não é possível conversar com os agentes nem executá-los; isso chega na Fase 7. O andamento está em [ROADMAP.md](ROADMAP.md).

## Funcionalidades

Planejadas; cada uma será marcada como disponível quando for entregue.

| Funcionalidade | Fase | Disponível |
|---|---|---|
| Painel com estado dos agentes, execuções e alertas | 4 / 7 | Sim (atividade em tempo real na Fase 7) |
| Visão "Escritório" com projetos e agentes | 4 / 7 | Sim (atualiza a cada 5 s) |
| Criar, editar, duplicar, ativar e excluir agentes; projetos | 5 | Sim |
| Provedores e modelos (Ollama, OpenAI-compatível, Anthropic) | 6 | Sim (OpenAI e Anthropic ainda não validados com o serviço real) |
| Chat com streaming, histórico e interrupção | 7 | Não |
| Logs e linha do tempo das execuções | 7 | Não |
| Ferramentas com permissões e aprovação humana | 8 | Não |
| Delegação entre agentes | 8 | Não |

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
| `MAX_CONCURRENT_RUNS` | `4` | Execuções simultâneas (usado a partir da Fase 7). |
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
| [SPEC.md](SPEC.md) | Requisitos, casos de uso, regras de negócio, critérios de aceite. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Componentes, fluxos de dados, persistência. |
| [SECURITY.md](SECURITY.md) | Modelo de ameaças, controles, segredos, permissões. |
| [TESTING.md](TESTING.md) | Estratégia de testes e registro de execuções. |
| [ROADMAP.md](ROADMAP.md) | Fases e andamento. |
| [CLAUDE.md](CLAUDE.md) | Instruções permanentes para o Claude Code. |

## Privacidade

Com modelos locais, nada sai da sua máquina. Ao usar um provedor externo, o prompt de sistema, o histórico da conversa e os resultados de ferramentas do agente são enviados a esse provedor. A interface sinaliza isso em cada agente.
