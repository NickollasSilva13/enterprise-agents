# SECURITY — Políticas e orientações de segurança

> Estado: Fase 2. Os controles abaixo são o **projeto** de segurança; a coluna "Fase" indica quando cada um é implementado e testado. A seção 9 registra o que já está efetivamente em vigor.

## 1. Princípios

1. **O prompt não é controle de segurança.** Nenhuma proteção depende de o modelo obedecer a instruções.
2. **Negação por padrão.** Um agente só faz o que foi explicitamente concedido.
3. **A decisão é do backend.** Permissões, limites e validações são aplicados no servidor, a cada chamada.
4. **Saída de modelo e de ferramenta é dado não confiável.**
5. **Local por padrão.** Nada sai da máquina sem que o usuário tenha configurado e sido informado.

## 2. Ativos protegidos

| Ativo | Por que importa |
|---|---|
| Chaves de API e credenciais | Uso indevido gera custo e acesso a contas de terceiros. |
| Arquivos do usuário | Um agente pode ler, alterar ou apagar dados. |
| Sistema operacional | Execução de comandos equivale a controle da máquina. |
| Rede local | Serviços internos (roteador, NAS, outros apps locais) podem ser alcançados por um agente. |
| Conversas e prompts | Podem conter informação pessoal ou confidencial. |
| Integridade dos registros | Logs e auditoria precisam ser confiáveis para investigar incidentes. |

## 3. Modelo de ameaças

| # | Ameaça | Vetor |
|---|---|---|
| A1 | Página web maliciosa aciona a API local | CSRF, DNS rebinding, requisições a `localhost` a partir do navegador. |
| A2 | Exposição acidental na rede | Servidor escutando em `0.0.0.0`; redirecionamento de porta. |
| A3 | Prompt injection | Conteúdo de arquivo, página ou resultado de ferramenta instrui o agente a agir contra o usuário. |
| A4 | Execução arbitrária de comandos | Agente usa a ferramenta de script, ou injeta argumentos em um comando. |
| A5 | Fuga da pasta de trabalho | `..`, caminhos absolutos, links simbólicos, nomes reservados do Windows. |
| A6 | Acesso indevido à rede local (SSRF) | Ferramenta de busca de URL apontada para IPs privados ou metadados. |
| A7 | Vazamento de segredos | Chave em log, resposta de API, exportação, mensagem de erro ou contexto enviado ao modelo. |
| A8 | Exaustão de recursos | Laço infinito de ferramentas, delegação recursiva, respostas gigantes. |
| A9 | Vazamento para provedor externo | Dados sensíveis enviados a um serviço em nuvem sem o usuário perceber. |
| A10 | Dependência comprometida | Pacote npm malicioso ou vulnerável. |
| A11 | XSS na interface | Saída do modelo renderizada como HTML. |

**Fora do modelo:** um atacante que já executa código com o usuário do sistema operacional, ou com acesso físico à máquina. Nesse caso ele já alcança o banco e o cofre; a aplicação não tenta se defender disso.

## 4. Superfícies de ataque

- API HTTP local e fluxo SSE.
- Interface web (renderização de conteúdo gerado por modelo).
- Ferramentas: sistema de arquivos, rede, processos.
- Conteúdo ingerido pelos agentes (arquivos, páginas, respostas de outros agentes).
- Adaptadores de provedores (requisições de saída).
- Banco de dados e pasta `data/`.
- Cadeia de dependências.

## 5. Controles

| ID | Controle | Ameaças | Fase |
|---|---|---|---|
| C-01 | Servidor escuta somente em `127.0.0.1`; não há opção de configuração para outro endereço. | A2 | 3 |
| C-02 | Validação do cabeçalho `Host` contra a lista `127.0.0.1:porta` e `localhost:porta`. | A1 | 3 |
| C-03 | Validação de `Origin` em toda requisição de API que altera estado (cabeçalho ausente também é recusado); recusa de chamadas de API com `Sec-Fetch-Site` diferente de `same-origin`/`none`, o que barra inclusive outras aplicações em outras portas de `localhost`; CORS desabilitado. | A1 | 3 |
| C-04 | Cookie de sessão `HttpOnly`, `SameSite=Strict`, com token aleatório novo a cada inicialização, emitido por `POST /api/session` (sujeito a C-03) e exigido em todas as demais rotas de API. Comparação em tempo constante. | A1 | 3 |
| C-05 | Content-Security-Policy restritiva em toda resposta: só recursos da própria origem, sem scripts ou estilos inline, sem `eval`, sem enquadramento por outras páginas. Mais `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Permissions-Policy` e `Cache-Control: no-store` na API. A interface não usa estilos inline nem recursos de terceiros (a fonte é embutida). | A11 | 4 |
| C-06 | Validação de toda entrada com Zod, com limites de tamanho. | A4, A8 | 3 em diante |
| C-07 | Saída de modelo renderizada como Markdown sanitizado, sem HTML bruto. | A11 | 7 |
| C-08 | Credenciais no cofre do sistema (`SecretStore`); o banco guarda só uma referência (`provider:<id>`). O segredo é gravado antes do registro e apagado junto com o provedor. | A7 | 6 |
| C-09 | A API nunca devolve credenciais; a interface mostra apenas "configurada" e os últimos 4 caracteres. | A7 | 6 |
| C-10 | Redação de segredos em logs e mensagens de erro. Erros de provedor têm mensagem fixa por tipo; o texto devolvido pelo provedor nunca vai à resposta e só vai ao log depois de removidas a chave conhecida e qualquer padrão de credencial (`sk-…`, `Bearer …`, `x-api-key`). Requisições a provedores não seguem redirecionamentos, para a chave não ser levada a outro endereço. | A7 | 6 |
| C-11 | Credenciais nunca entram no contexto enviado ao modelo nem no ambiente de ferramentas. | A7, A3 | 6 / 8 |
| C-12 | Indicação clara de provedor externo e do que é enviado a ele: qualquer endereço que não seja de loopback conta como externo, inclusive outra máquina da rede local. O aviso aparece ao cadastrar, no cartão do provedor e ao escolher o modelo no agente. | A9 | 6 |
| C-13 | Limites por execução: tempo, passos, tokens; limite global de execuções simultâneas. | A8 | 7 |
| C-14 | Cancelamento que interrompe a chamada ao modelo e as ferramentas em curso. | A8 | 7 |
| C-15 | `PermissionEngine`: ferramenta não concedida é negada; decisão por agente e por ferramenta. | A3, A4 | 8 |
| C-16 | Aprovação humana obrigatória para ferramentas de risco alto, com exibição exata dos argumentos. | A3, A4 | 8 |
| C-17 | Acesso a arquivos confinado à pasta de trabalho: caminho resolvido e canonicalizado (`realpath`), rejeição de links simbólicos que saem da pasta e de nomes reservados. | A5 | 8 |
| C-18 | Limites de tamanho para leitura e escrita de arquivos. | A8 | 8 |
| C-19 | Busca de URL: só `http`/`https`; resolução de DNS e bloqueio de endereços de loopback, privados, link-local e de metadados; revalidação a cada redirecionamento; limite de tamanho e de tempo. | A6 | 8 |
| C-20 | Ferramenta de script desligada por padrão; quando ligada, sempre exige aprovação, roda sem shell (argumentos em lista), com ambiente mínimo, diretório na pasta de trabalho e tempo limite. | A4 | 8 |
| C-21 | Delegação com profundidade máxima e detecção de ciclos. | A8 | 8 |
| C-22 | Resultados de ferramentas são entregues ao modelo delimitados como dados; o agente delegado não herda permissões do delegante. | A3 | 8 |
| C-23 | Trilha de auditoria somente de inserção para operações sensíveis: gatilhos no banco recusam `UPDATE` e `DELETE` em `audit_log`. Textos gravados passam pela redação de segredos. | — | 6 / 8 |
| C-24 | `npm audit` no fluxo de verificação; versões fixadas pelo lockfile. | A10 | 3 / 10 |

### Sobre prompt injection

Não existe defesa completa contra prompt injection. A estratégia é limitar o dano possível:

- o agente só tem as ferramentas concedidas (C-15);
- ações de alto risco passam por uma pessoa, que vê exatamente o que será feito (C-16);
- os alcances são confinados: pasta de trabalho (C-17) e rede pública (C-19);
- segredos não estão ao alcance do agente (C-11).

Um agente com permissão `allow` para escrever arquivos ainda pode ser induzido a escrever conteúdo indesejado **dentro da sua pasta de trabalho**. Esse risco residual é aceito e documentado.

### Sobre isolamento

Sem contêiner ou VM, não há isolamento de processo. Um script aprovado roda com os privilégios do usuário e pode alcançar qualquer coisa que o usuário alcança. Os controles de C-20 reduzem acidentes, não contêm código malicioso. Quem precisar de execução de scripts não supervisionada deve aguardar o executor em contêiner (melhoria futura).

## 6. Gerenciamento de segredos

- **Onde ficam:** cofre do sistema operacional (Credential Manager no Windows), sob o serviço `enterprise-agents`, uma entrada por provedor, chamada `provider:<id>`.
- **O que o banco guarda:** apenas o identificador da entrada.
- **`.env`:** somente configuração não sensível (porta, pasta de dados, nível de log). Nunca chaves.
- **Rotação:** substituir a chave pela interface sobrescreve a entrada no cofre.
- **Remoção:** excluir o provedor apaga a entrada do cofre.
- **Se o cofre não estiver disponível:** provedores que exigem chave não podem ser salvos e a interface explica o motivo. Não há alternativa em texto puro.
- **`SECRET_STORE=memory`:** existe só para os testes automatizados, para que não toquem o cofre real. As chaves ficam na memória do processo e se perdem ao encerrar; a tela de Configurações mostra quando esse modo está ativo. Não é um modo de uso.
- **SDK da Anthropic:** sem uma chave explícita, o SDK procuraria credenciais por conta própria (variáveis de ambiente ou um perfil logado na máquina) e as enviaria ao endereço configurado no provedor. O adaptador sempre passa a chave do cofre e, se não houver chave, falha antes de enviar qualquer coisa. Há teste para isso.
- **Git:** `data/`, `.env` e arquivos de banco constam no `.gitignore`.

## 7. Permissões

Três níveis por par agente/ferramenta:

| Nível | Efeito |
|---|---|
| `deny` (padrão) | A chamada é recusada e o modelo recebe um erro. |
| `ask` | A execução pausa até a decisão do usuário. |
| `allow` | A chamada executa sem intervenção. |

Cada ferramenta declara um risco. Ferramentas de risco **alto** (hoje, apenas executar script) não aceitam `allow`: o máximo é `ask`.

| Ferramenta | Risco | Nível máximo |
|---|---|---|
| Ler arquivo / listar pasta | baixo | `allow` |
| Escrever arquivo | médio | `allow` |
| Buscar URL | médio | `allow` |
| Delegar a agente | médio | `allow` |
| Executar script | alto | `ask` |

## 8. Tratamento de vulnerabilidades e reporte

Este é um projeto de uso pessoal e local. Ao identificar um problema de segurança:

1. Registrar em `SECURITY.md`, seção 10, com data, descrição, impacto e estado.
2. Se houver credencial possivelmente exposta, revogá-la no provedor antes de qualquer outra coisa.
3. Corrigir com um teste que reproduza o problema.
4. Atualizar o controle correspondente na seção 5.

Dependências: executar `npm audit` antes de cada fechamento de fase e avaliar os achados de severidade alta ou crítica.

## 9. Estado de implementação

| Fase | Controles em vigor |
|---|---|
| 2 | Nenhum (apenas documentação). |
| 3 | C-01, C-02, C-03, C-04, C-06 (infraestrutura de validação e limite de 1 MB por requisição), C-24. Todos com testes automatizados. |
| 4 | C-05, com testes de API e no navegador (script inline injetado não executa). |
| 6 | C-08, C-09, C-10, C-12 e a parte de C-23 que cobre provedores, chaves e modelos. C-11 está atendido no que existe: a chave só aparece no cabeçalho de autenticação enviado ao provedor; a parte de ferramentas entra na Fase 8. Todos com testes, incluindo um que procura a chave no conteúdo bruto do banco e em todas as respostas da API. |
| 5 | C-06 aplicado às rotas de agentes e projetos: esquemas estritos (campo desconhecido é recusado), limites de tamanho em todos os textos e faixas em todos os números. As rotas novas herdam C-02 a C-04, com teste. |

Além dos controles numerados, a Fase 3 garante que erros inesperados são devolvidos como mensagem genérica, sem stack trace nem texto do erro original (base para C-10).

## 10. Problemas conhecidos

| Data | Descrição | Impacto | Estado |
|---|---|---|---|
| 2026-11-12 | `npm audit` aponta 14 avisos de severidade moderada, todos em ferramentas de desenvolvimento: `esbuild` antigo embutido no `drizzle-kit` e `minimatch` usado pelo ESLint. `npm audit --omit=dev` não encontra nenhuma vulnerabilidade. | Nenhum na aplicação em execução. O aviso do `esbuild` trata do servidor de desenvolvimento dele, que o `drizzle-kit` não inicia; o do `minimatch` exige padrões glob maliciosos, que não recebemos de terceiros. | Aceito. Reavaliar na Fase 10 ou quando houver versões corrigidas. |
