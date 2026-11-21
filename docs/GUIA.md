# Guia de utilização — Enterprise Agents

Este guia mostra como usar a plataforma do zero: instalar, conectar um modelo, criar agentes, conversar, liberar ferramentas, acompanhar o trabalho e cuidar dos seus dados. Para requisitos e decisões, veja [SPEC.md](../SPEC.md); para os controles de segurança, [SECURITY.md](../SECURITY.md).

Tudo roda na sua máquina, em `http://127.0.0.1:4317`. Não há contas: quem usa o seu usuário do sistema usa a aplicação.

## Sumário

1. [Instalação e primeira execução](#1-instalação-e-primeira-execução)
2. [Conectar um provedor de modelos](#2-conectar-um-provedor-de-modelos)
3. [Criar e configurar agentes](#3-criar-e-configurar-agentes)
4. [Conversar com um agente](#4-conversar-com-um-agente)
5. [Ferramentas e permissões](#5-ferramentas-e-permissões)
6. [Aprovações](#6-aprovações)
7. [Delegação entre agentes](#7-delegação-entre-agentes)
8. [Acompanhar o trabalho: Escritório, Relatórios e Logs](#8-acompanhar-o-trabalho-escritório-relatórios-e-logs)
9. [Exportar, importar e cópia de segurança](#9-exportar-importar-e-cópia-de-segurança)
10. [Segurança, privacidade e solução de problemas](#10-segurança-privacidade-e-solução-de-problemas)

## 1. Instalação e primeira execução

**Você precisa de:** Node.js 22 ou superior e npm 10 ou superior. Para modelos locais, o [Ollama](https://ollama.com) com ao menos um modelo baixado (por exemplo, `ollama pull llama3.2:3b`). Docker não é necessário.

Na pasta do projeto:

```bash
npm install
```

```bash
npm start
```

O segundo comando compila a interface, cria o banco em `data/app.db` se ele não existir e inicia o servidor. Abra `http://127.0.0.1:4317` no navegador. Para encerrar, pressione `Ctrl+C` no terminal.

**Configuração (opcional).** Copie `.env.example` para `.env` para mudar a porta (`APP_PORT`), a pasta de dados (`DATA_DIR`), o nível de log ou os limites de execuções simultâneas e de delegação. Um valor inválido impede a inicialização, com uma mensagem que aponta a variável. Chaves de API **não** vão no `.env`.

O Escritório é a tela inicial. Em uma instalação nova, o cartão **Primeiros passos**, acima do time, leva você por quatro etapas: conectar um provedor, habilitar um modelo, criar uma área a partir de um modelo pronto e criar a primeira tarefa. Cada etapa fica marcada quando os seus dados mostram que ela foi feita, e o botão da etapa seguinte abre o formulário certo. **Pular por agora** guarda o cartão; ele volta pela **Ajuda**.

**Ajuda.** "Precisa de ajuda?", no pé do menu, abre este guia dentro da plataforma, mostra onde estão os primeiros passos e traz de volta as dicas que você fechou. As dicas são frases curtas que aparecem uma vez onde ajudam (no Escritório, no quadro, em Ferramentas, em Aprovações e em Automações) e somem quando você clica em **Entendi**.

## 2. Conectar um provedor de modelos

Um agente só responde se tiver um modelo, e os modelos vêm de um provedor. Na tela **Modelos de IA**:

1. Escolha **Adicionar provedor**.
2. Dê um nome, escolha o tipo e informe o endereço:

   | Tipo | Endereço típico | Chave de API |
   |---|---|---|
   | Ollama | `http://127.0.0.1:11434` | Não usa |
   | Compatível com OpenAI | o endereço do serviço | Opcional |
   | Anthropic | o endereço da API da Anthropic | Obrigatória |
   | Claude Code (harness) | o comando `claude` | Não usa |
   | Codex (harness) | o comando `codex` | Não usa |

3. Salve. Os modelos do provedor são buscados e aparecem **desabilitados**.
4. Habilite, na chave ao lado de cada um, os modelos que quer usar. Só modelos habilitados podem ser escolhidos em um agente.
5. Use o teste de conexão do provedor para confirmar que ele responde.

**Chaves.** A chave é guardada no cofre de credenciais do sistema operacional, nunca no banco. Depois de salva, a tela mostra apenas que ela existe e os últimos quatro caracteres.

**Provedor externo.** Qualquer endereço que não seja desta máquina é tratado como externo, inclusive outro computador da sua rede. A tela avisa disso ao cadastrar, no cartão do provedor e ao escolher o modelo no agente, porque as suas conversas passam a sair da máquina (veja a seção 10).

**Harness que você já tem.** Nos tipos de harness, em vez do endereço você informa o **comando** do programa (só o nome, se ele estiver no `PATH`, ou o caminho completo; nunca argumentos). O agente responde pela sua assinatura do Claude Code ou do Codex, sem chave de API e sem custo por token. Para isso o programa precisa estar instalado e com a conta conectada: se não estiver, a aplicação avisa que "o harness não está conectado a uma conta" — abra um terminal, execute o programa e entre na sua conta. A aplicação roda o harness com as ferramentas, os comandos, os ganchos e as configurações dele desligados, e oferece a ele só as ferramentas da plataforma que o agente tem permissão de usar, com aprovação quando for o caso, como em qualquer outro provedor. Cada passo com ferramenta executa o programa de novo, então esses agentes respondem mais devagar. Se você cadastrou o provedor de harness antes desta versão, use **Atualizar modelos** no cartão dele para que os modelos passem a aceitar ferramentas. O harness roda nesta máquina, mas responde pelo serviço do fornecedor dele, então conta como provedor externo.

**Ferramentas.** No Ollama, a aplicação detecta quais modelos aceitam ferramentas. Em serviços compatíveis com OpenAI isso não é informado: marque o modelo, na própria tela Modelos, como capaz de usar ferramentas.

Um provedor ou modelo em uso por algum agente não pode ser excluído nem desabilitado; troque o modelo do agente antes.

> Validado com o serviço real: apenas o Ollama. Os adaptadores de OpenAI e Anthropic foram testados contra servidores simulados que seguem cada protocolo. Os dois harness foram testados contra um programa simulado: o Codex não estava instalado na máquina de desenvolvimento, e a conta do Claude Code não pôde ser usada de fora do aplicativo dele.

## 3. Criar e configurar agentes

Na tela **Agentes**, escolha **Novo agente**. Só o nome é obrigatório; o resto pode ser ajustado depois.

| Campo | Para que serve |
|---|---|
| Nome | Como o agente aparece em toda parte. Não pode repetir o de outro agente. |
| Descrição e objetivo | O objetivo é enviado ao modelo junto com as instruções, e é o que outros agentes veem ao escolher a quem delegar. |
| Prompt de sistema | As instruções permanentes do agente. |
| Projeto | A sala do agente no Escritório. Opcional. |
| Modelo de IA | Um dos modelos habilitados. Sem modelo, o agente existe mas não conversa. |
| Temperatura | Quanto a resposta varia. Não é enviada à Anthropic, que recusa esse parâmetro. |
| Limites | Tokens por resposta, passos por execução, tempo por execução e, se quiser, tokens por execução. |

Os limites são aplicados pelo servidor, não pelo modelo: ao passar do tempo, a execução é encerrada; ao passar de passos ou tokens, ela falha com o motivo.

**Projetos** são criados, renomeados e excluídos na mesma tela. Excluir um projeto não exclui os agentes dele; eles ficam sem projeto.

Na lista, cada agente tem:

- uma chave para **ativar ou desativar** (agente inativo não recebe mensagens nem tarefas);
- atalhos para **conversar**, ver o **histórico**, ajustar as **ferramentas**, **editar**, **duplicar** e **excluir**.

Duplicar copia a configuração e as permissões de ferramentas, não o histórico. Excluir tira o agente das listas e mantém o histórico de execuções dele; não pode ser desfeito e é recusado enquanto houver uma execução em andamento.

## 4. Conversar com um agente

Abra a conversa pelo atalho na lista de agentes ou clicando no agente no Escritório.

- Escreva no campo **Mensagem** e envie. A resposta aparece enquanto é escrita.
- **Interromper** para a execução na hora; o que já foi escrito fica.
- Ao fim de cada resposta aparecem a duração, os tokens e o link **Ver passos**, que abre a execução nos Logs.
- A lista **Conversas** guarda o histórico do agente; você pode reabrir, continuar ou excluir uma conversa.
- Só há uma execução por conversa de cada vez: espere a resposta ou interrompa antes de enviar outra mensagem.

O que saber:

- As respostas são exibidas como Markdown básico. HTML no texto aparece como texto, imagens não são carregadas e links abrem em outra aba.
- O histórico inteiro da conversa é enviado ao modelo a cada mensagem. Conversas muito longas podem passar do que o modelo aceita; nesse caso, comece uma conversa nova.
- Nas mensagens seguintes, o agente vê o que ele mesmo escreveu, não o resultado bruto das ferramentas que usou antes.
- Se o servidor for encerrado no meio de uma resposta, a execução fica marcada como interrompida e a conversa continua disponível.

## 5. Ferramentas e permissões

Um agente começa **sem nenhuma ferramenta**. Na tela **Ferramentas**, escolha o agente e defina cada ferramenta como bloqueada, **Pede aprovação** ou **Permitida**; depois, **Salvar permissões**.

| Ferramenta | O que faz | Risco | Máximo |
|---|---|---|---|
| Ler arquivo, Listar pasta | Leem a pasta de trabalho do agente. | Baixo | Permitida |
| Escrever arquivo | Cria ou substitui arquivos na pasta de trabalho. | Médio | Permitida |
| Buscar URL | Lê páginas públicas da internet. Endereços desta máquina e da rede local são bloqueados. | Médio | Permitida |
| Delegar a agente | Passa uma tarefa a outro agente. | Médio | Permitida |
| Executar script | Roda um script Node.js que já esteja na pasta de trabalho. | Alto | Pede aprovação |

**Pasta de trabalho.** Cada agente tem a sua, em `data/workspaces/<id do agente>`; o caminho aparece na tela. O agente não lê nem escreve fora dela. Para dar um arquivo a um agente, coloque-o nessa pasta.

**Executar script** nasce desligada para a instalação inteira. Ligá-la pede confirmação, e mesmo ligada ela sempre pede aprovação. O script roda com o seu usuário do sistema e pode usar a rede: aprove só o que você leu.

**Recomendação.** Em um agente que lê arquivos sensíveis, deixe "Buscar URL" em "Pede aprovação". Um texto lido pelo agente pode tentar convencê-lo a enviar dados para fora dentro de um endereço; o pedido de aprovação mostra o endereço completo.

O modelo precisa aceitar ferramentas (seção 2). Se não aceitar, o agente só conversa, e a tela avisa.

## 6. Aprovações

Quando um agente pede uma ferramenta marcada como "Pede aprovação", a execução **para** e espera você. O pedido aparece em três lugares:

- na própria conversa;
- na tela **Aprovações**;
- na mesa do agente no Escritório, com o botão **Decidir**.

O pedido mostra os argumentos exatos que a ferramenta vai receber: o caminho e o conteúdo do arquivo, o endereço a buscar, o script e os argumentos. Você pode **Aprovar** ou **Negar**; ao negar, pode escrever um motivo, que o agente recebe.

- O tempo de espera não conta no limite de tempo da execução. Um pedido não expira sozinho.
- Se a execução for interrompida, o pedido é retirado.
- Cada pedido só pode ser respondido uma vez.
- A tela Aprovações também lista as decisões recentes.

## 7. Delegação entre agentes

Com a ferramenta **Delegar a agente**, um agente pode passar uma tarefa a outro, pelo nome, e receber a resposta.

- Quem recebe usa o **próprio** modelo, os próprios limites, as próprias permissões e a própria pasta. Nada é herdado de quem delegou.
- Quem recebe não vê a conversa de quem delegou: só a tarefa. Por isso vale escrever, no prompt de sistema do agente coordenador, que ele descreva a tarefa por completo.
- Um agente não aparece duas vezes na mesma cadeia (não há ciclos, nem delegar a si mesmo), e a cadeia tem profundidade máxima (`MAX_DELEGATION_DEPTH`, padrão 3).
- Interromper a execução de origem interrompe as delegadas.

Um arranjo simples: um agente coordenador com "Delegar a agente" permitida, e agentes especialistas com um objetivo claro, que é o que o coordenador lê para escolher.

Nos Logs, a execução mostra a **árvore de execução**, com um link para a de cada agente. No Escritório, quem delegou caminha até a mesa do colega e espera ao lado.

### Áreas, quadro de tarefas e fluxos

Para trabalho que passa de mão em mão, como numa empresa, use o menu **Tarefas**. Uma **área** é um time: os agentes de um projeto, um fluxo e um quadro.

1. **Crie uma área a partir de um modelo**: "Nova área a partir de modelo", escolha o modelo de fluxo (os prontos são **Desenvolvimento**, **Marketing**, **Dados**, **Produto** e **Conteúdo e documentação**; a janela mostra as etapas, os agentes, o acesso de cada um à pasta da área e as boas práticas), dê um nome e escolha o modelo de IA dos agentes. A plataforma cria a área, os agentes de cada papel, já com instruções, e o fluxo. As ferramentas sugeridas começam como "Pede aprovação": libere na tela Ferramentas o que quiser deixar automático.
2. **Ou monte o seu fluxo**: em "Editar fluxo", defina as etapas (de um agente, sua ou final), quem trabalha em cada uma e as **passagens**: de onde para onde uma tarefa pode ir, e se quem leva é o agente, você ou os dois. Das etapas suas e da final, só você move a tarefa.
3. **Crie uma tarefa** com título, descrição e critérios de aceite. Ela entra na primeira etapa. Quando chega à etapa de um agente, ele começa a trabalhar sozinho e, ao terminar, passa a tarefa adiante com uma nota, só pelas passagens que você liberou. Cada agente trabalha numa tarefa por vez; as outras esperam na fila dele.
4. **A pasta compartilhada da área** é onde os agentes trocam arquivos, pelo prefixo `area/` (por exemplo, `area/especificacao.md`). Na configuração de cada agente, escolha se ele não tem acesso, só lê ou lê e escreve.

Uma tarefa **para e espera você** quando chega a uma etapa sua, quando a execução falha, quando o agente termina sem passar a tarefa adiante, ou quando ela volta mais de 3 vezes entre etapas ou chega a 20 execuções (proteção contra dois agentes devolvendo trabalho um ao outro sem fim). Essas tarefas aparecem na tela **Aprovações**, em "Tarefas esperando você". Na página da tarefa você lê o histórico com as notas de cada agente, comenta, move, retoma ou cancela. No quadro, você também pode arrastar o cartão até outra etapa (no computador) ou usar o botão **Mover para…** do cartão (no celular ou pelo teclado): só as etapas que o fluxo permite aceitam o cartão, e a mudança só vale depois de você confirmar, com uma nota opcional para quem vem depois. Uma tarefa cancelada sai do quadro, mas o histórico fica; por isso uma área com tarefas não pode ser excluída.

> Validado com o provedor simulado dos testes, não com um modelo real atravessando um fluxo inteiro.

### Modelos de fluxo

Em Tarefas → **Modelos de fluxo** ficam os modelos prontos e os seus.

- **Salvar uma área como modelo**: na tela de fluxo da área, **Salvar como modelo**. O modelo guarda o fluxo como está salvo: etapas, passagens e os agentes das etapas, com instruções, acesso à pasta da área e o nome das ferramentas. Não guarda o modelo de IA, tarefas, arquivos nem permissões: ao aplicar, toda ferramenta pede aprovação.
- **Mudar um modelo seu**: o nome, a descrição e as boas práticas mudam na tela de modelos. Para mudar etapas ou agentes, crie uma área com ele, ajuste o fluxo e salve como modelo de novo. Os modelos prontos não mudam.
- **Levar para outra máquina**: **Exportar** gera um arquivo JSON sem nada secreto; **Importar modelo** traz de volta. Ferramentas que não existem aqui, de risco alto ou que só existem dentro das tarefas ficam de fora, com aviso. Confira o acesso dos agentes à pasta da área antes de usar um modelo que veio de outra pessoa.
- **Excluir** um modelo seu não muda as áreas criadas com ele.

O modelo Produto termina mandando a especificação como pedido para outra área: crie antes a regra em **Pedidos entre áreas**.

> Os fluxos novos foram validados pelas regras e pela interface, não percorridos por um modelo real.

### Agendamentos

Em **Automações** (no menu; também em Tarefas → Agendamentos), uma tarefa é criada sozinha no quadro de uma área em horários marcados, como um relatório toda segunda às 9h.

1. **Novo agendamento**: escolha a área, escreva a tarefa como faria à mão (título, descrição, critérios de aceite, prioridade) e a repetição: uma vez, todo dia, toda semana (nos dias que marcar) ou todo mês (num dia; em meses mais curtos, vale o último dia). O horário é o desta máquina.
2. **Na hora marcada**, a tarefa entra na primeira etapa do fluxo da área e segue como qualquer outra. A página dela mostra de qual agendamento veio, e o histórico diz para quando estava marcada.
3. **Sem empilhar**: enquanto a tarefa anterior do agendamento estiver aberta, nenhuma nova é criada; a tela mostra que ele pulou aquela vez.
4. **Plataforma desligada**: se ela estava desligada na hora marcada, a tarefa é criada uma vez quando voltar, mesmo que vários horários tenham passado.

Na lista dá para pausar e retomar (a contagem recomeça de agora), **Criar agora** (sem mudar a próxima vez), editar e excluir. Excluir um agendamento não apaga as tarefas que ele criou. Só você cria agendamentos: os agentes não têm ferramenta para isso.

### Pedidos entre áreas

Uma área pode pedir trabalho a outra, como o marketing pede números à área de dados.

1. **Libere o pedido**: em Tarefas → **Pedidos entre áreas**, crie uma regra dizendo que uma área pode pedir trabalho a outra. Sem regra, nenhum pedido é aceito. Com "Exigir minha aprovação" ligado (o padrão), cada pedido espera você antes de entrar no quadro da outra área.
2. **Peça**: na página de uma tarefa, em "Pedidos a outras áreas", escolha a área, diga o que precisa e, se quiser, liste arquivos da pasta da área para mandar uma cópia. Os agentes fazem o mesmo com a ferramenta `request_from_area`, que aparece para eles quando há uma regra; o briefing diz a quais áreas podem pedir.
3. **O pedido vira uma tarefa** na primeira etapa do fluxo da outra área. A tarefa que pediu fica "Aguardando outra área" e não volta a um agente até a entrega.
4. **A entrega**: o que a outra área deixar em `area/entregas/<pedido>/` é copiado para `area/recebidos/<pedido>/` da área que pediu quando o pedido chega à etapa final, e a nota de quem concluiu vai para o histórico da tarefa que pediu, que volta a andar.

Se você recusar um pedido, a tarefa que pediu segue sem ele, com o motivo no histórico; se cancelar, ela para e espera você. Um pedido não pode voltar a uma área que já está na cadeia (o marketing pede a dados, que não pode pedir de volta ao marketing pela mesma tarefa), e a cadeia tem no máximo 3 níveis. No Escritório, o agente que fez o pedido vai até a sala da outra área por alguns segundos.

> Validado com o provedor simulado e pela interface, não com um modelo real pedindo trabalho.

## 8. Acompanhar o trabalho: Escritório, Relatórios e Logs

**Relatórios** (antes "Painel"). Quantos agentes há em cada estado, execuções em andamento e à espera de aprovação, indicadores das últimas 24 horas (concluídas, taxa de sucesso, tokens), a atividade recente e os alertas: falhas, aprovações pendentes, agente sem modelo, provedor inacessível. Atualiza sozinho.

**Estados de um agente:**

| Estado | Significa |
|---|---|
| Aguardando você | Uma execução espera a sua aprovação. |
| Com falha | A última execução terminada falhou ou passou do tempo. |
| Trabalhando | Há uma execução em andamento ou na fila. |
| Ocioso | Nada em andamento. |
| Inativo | Desativado por você. |

**Escritório.** Uma planta isométrica em pixel art: cada projeto tem uma sala e cada agente, uma mesa. O que cada um faz aparece num balão sobre a cabeça e na animação. Além das salas dos projetos há a Recepção, a Copa, a Sala de reunião e a Descompressão:

- quem está ocioso há 2 minutos vai à copa, e há 10 minutos, à descompressão (se o layout tiver uma);
- agente inativo fica fora do escritório;
- quem delega se reúne com quem recebeu a tarefa na sala de reunião; sem sala de reunião, vai até a mesa do colega;
- a coluna ao lado tem um cartão por agente, quem precisa de você primeiro: onde está, o que está fazendo ("passo 4 de até 20 · 3 min" enquanto trabalha) e o botão "Decidir" de quem espera a sua aprovação. Clicar no cartão abre a conversa; apontar para ele acende o agente na cena. Embaixo, a atividade recente: tarefas concluídas, entregas entre áreas, agendamentos, pedidos de aprovação e falhas. No celular, os dois ficam em abas;
- embaixo da cena, quatro indicadores: concluídas hoje (contra ontem), tempo médio por tarefa, execuções sem falha e concluídas na semana, cada um com o gráfico dos últimos 7 dias e o "?" que explica a conta. Sem nada a contar, o cartão diz isso em vez de mostrar zero. Os mesmos cartões ficam no topo dos Relatórios;
- no pé da coluna, as ações rápidas: criar tarefa, novo agente e agendar tarefa. O sino no alto conta as aprovações pendentes.

O escritório aparece inteiro, em 3D, visto do alto na diagonal; ele se ajusta sozinho ao tamanho da janela. Se o seu navegador não tiver WebGL, aparece o desenho plano das versões anteriores. Clicar em um agente na cena acende o cartão dele na coluna ao lado. Se o seu sistema estiver com "reduzir movimento" ligado, os agentes mudam de lugar sem caminhar.

**Editar o escritório.** O botão "Editar escritório" abre o editor, que mostra o escritório em 3D como ele vai ficar (sem os agentes). A roda do mouse aproxima e afasta, e arrastar o chão vazio move a vista. Enquanto você não salvar nada, o layout é montado sozinho a partir dos projetos (e ganha uma sala a cada projeto novo). No editor:

- "Nova área" desenha uma sala arrastando na grade; escolha o tipo, o nome, o projeto (para salas de projeto e de foco) e o piso no painel ao lado;
- "Porta" abre ou fecha uma porta clicando na borda da sala; toda área precisa de ao menos uma porta para o corredor;
- "Móvel" põe uma peça do catálogo (mesas, plantas, sofás, estantes, bancada, cafeteira, mural e outras); R gira, as setas movem, Delete apaga;
- numa mesa, "De quem é a mesa" a reserva para um agente; mesa livre fica para o primeiro agente sem mesa do projeto da sala;
- "Modelo pronto" troca tudo por um dos modelos (completo, compacto, amplo); Ctrl+Z desfaz.

O editor só deixa salvar um layout sem problemas e lista o que corrigir (sala sem porta, móvel sobre móvel, cadeira sem acesso, falta de recepção ou copa). Em "Entorno" você escolhe o que fica em volta do escritório: o parque (o padrão de um escritório novo: gramado, caminhos de pedra, lago com ponte e deque, coreto, árvores e canteiros), a cidade (as torres ao fundo) o bairro residencial (ruas com calçadas, casas com quintal e cerca, carros e postes) o condomínio moderno (casas modernas em volta de uma piscina, com portaria e muro), a ilha tropical (praia, mar, coqueiros e um píer com bangalôs) ou o jardim tecnológico (caminhos acesos, árvores de luz, painéis solares e uma estufa em cúpula). "Voltar ao automático" apaga o layout salvo. Agente sem mesa no layout espera na recepção, e o painel avisa.

**Aparência dos agentes.** No formulário do agente, a seção "Aparência" escolhe entre pessoa e robô e, para pessoa, a pele, os olhos, o cabelo, a barba, a roupa e a estampa, a calça, o calçado e um acessório, com prévia. Os personagens são pixel art 16 bits vistos em 3/4 e olham para o lado em que andam. "Sortear" escolhe tudo ao acaso. Agentes criados antes desta versão continuam como o robô de sempre até você escolher outra coisa. A aparência vai junto quando você exporta o agente.

**Logs.** A lista de execuções, com filtros por agente, estado e período. Cada execução abre a linha do tempo dos passos: chamadas ao modelo com duração e tokens, ferramentas pedidas e seus resultados, aprovações, delegações e erros, em linguagem comum. As mensagens de erro são frases fixas; o detalhe técnico de uma falha de provedor fica só no log do servidor, sem a chave.

**Configurações** mostra os dados da instalação: versão, endereço, pasta de dados, limites e onde as chaves são guardadas.

## 9. Exportar, importar e cópia de segurança

### Exportar agentes

Na tela **Agentes**, **Exportar** baixa um arquivo `agentes-AAAA-MM-DD.json` com todos os agentes: nome, descrição, objetivo, prompt de sistema, limites, se está ativo, o nome do projeto, o nome do modelo e do provedor, e as permissões de ferramentas.

O arquivo **não** contém chaves de API, endereços de provedores, conversas, execuções nem arquivos das pastas de trabalho. Ainda assim, ele contém os seus prompts: trate-o como trata esses textos.

### Importar agentes

**Importar** lê um arquivo desse formato (até 1 MB e 100 agentes). A importação sempre **acrescenta**, nunca substitui:

- se já existe um agente com o mesmo nome, o novo entra como "Nome (importado)";
- o projeto de mesmo nome é usado; se não existir, é criado;
- o modelo só é ligado se existir aqui um modelo habilitado com o mesmo nome, em um provedor com o mesmo nome; caso contrário o agente fica sem modelo;
- **nenhuma ferramenta entra liberada**: o que estava "Permitida" no arquivo entra como "Pede aprovação", e ferramentas que não existem aqui são ignoradas.

Ao terminar, uma janela lista os agentes criados e o que mudou em cada um. Se algo no arquivo estiver errado, nada é importado e a mensagem diz o que foi encontrado.

A regra das ferramentas existe para que um arquivo recebido de outra pessoa não dê a um agente, sem você ver, o poder de agir sozinho. Revise as permissões na tela Ferramentas depois de importar.

### Cópia de segurança

Tudo o que a aplicação guarda está na pasta de dados (`data/` por padrão): o banco `app.db` e as pastas de trabalho. Para copiar:

1. Encerre o servidor (`Ctrl+C`).
2. Copie a pasta `data/` inteira.

Para restaurar, coloque a pasta de volta com o servidor parado.

As **chaves de API não estão nessa pasta**: ficam no cofre do sistema operacional. Em outra máquina, ou depois de reinstalar o sistema, informe as chaves de novo na tela Modelos.

## 10. Segurança, privacidade e solução de problemas

### O que a aplicação garante

- O servidor escuta só em `127.0.0.1`; isso não é configurável.
- A API só atende a própria interface: confere o endereço pedido, a origem da requisição e um cookie de sessão que muda a cada inicialização.
- Ferramenta não concedida não executa, mesmo que o modelo peça. A decisão é do servidor, a cada chamada, e nunca depende do que está no prompt.
- Chaves de API não aparecem no banco, nas respostas da API, nos logs nem no que é enviado ao modelo.
- Operações sensíveis ficam em uma trilha de auditoria que não pode ser alterada: provedores e chaves, permissões, aprovações, delegações, importações e ferramentas de risco médio ou alto.

### O que ela não garante

- **Prompt injection não tem defesa completa.** Um texto lido pelo agente pode tentar dirigi-lo. O dano é limitado pelo que você concedeu: mantenha as permissões no mínimo necessário e use "Pede aprovação" no que importa.
- **Scripts não são isolados.** Um script aprovado roda com o seu usuário.
- **Não há contas.** Quem usa o seu usuário do sistema tem acesso a tudo.

### Privacidade

Com modelos locais, nada sai da máquina. Com um provedor externo, vão para ele o prompt de sistema e o objetivo do agente, todas as mensagens da conversa, a descrição das ferramentas liberadas e os resultados das ferramentas usadas naquela resposta. A interface avisa sempre que o modelo escolhido é externo.

### Solução de problemas

| Sintoma | O que fazer |
|---|---|
| "A porta 4317 já está em uso" ao iniciar | Outro processo usa a porta, talvez outra cópia do servidor. Encerre-o ou defina `APP_PORT` no `.env`. |
| "Configuração inválida" ao iniciar | A mensagem aponta a variável do `.env` com problema. |
| A página não abre | Confirme que o terminal do servidor está aberto e use exatamente `http://127.0.0.1:4317`. |
| Alerta de provedor inacessível | Verifique se o Ollama está em execução e o endereço do provedor; use o teste de conexão. |
| "Este agente não tem um modelo habilitado" | Habilite um modelo na tela Modelos e escolha-o no agente. |
| "Este agente está inativo" | Ative-o na lista de agentes. |
| O agente não usa ferramentas | Confira as permissões na tela Ferramentas e se o modelo aceita ferramentas. Modelos pequenos também erram: às vezes escrevem o pedido como texto em vez de fazê-lo. |
| "O agente ainda está respondendo" | Espere ou interrompa a execução em andamento naquela conversa. |
| A execução terminou por tempo, passos ou tokens | Aumente o limite correspondente no agente, se fizer sentido. |
| Não consigo excluir provedor ou modelo | Algum agente o usa. Troque o modelo desses agentes antes. |
| A chave não pôde ser salva | O cofre de credenciais do sistema não está disponível. Não há alternativa em texto puro. |
| Depois de reiniciar, uma execução aparece como interrompida | Ela estava em andamento quando o servidor parou. Envie a mensagem de novo. |

Para ver o que aconteceu em uma execução, abra-a nos **Logs**. O terminal do servidor mostra os avisos e erros técnicos.
