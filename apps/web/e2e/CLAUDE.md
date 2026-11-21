# apps/web/e2e — fatos para o Claude Code

Carregado quando a tarefa toca os testes de ponta a ponta.

- Os arquivos desta pasta não têm os tipos do Node: nada de `node:fs` nem `Buffer`.
- Prepare dados com `api()` de `helpers.ts` (refaz a sessão em 401).
- Antes de rodar, as portas 4391 a 4396 precisam estar livres, e nenhum servidor de desenvolvimento pode estar em segundo plano: `tsx watch` reinicia sozinho e ocupa a porta 4317.
- Testes que alteram dados usam o servidor `CRUD_URL` (porta 4393) e colocam o nome do projeto do Playwright nos nomes que criam, porque desktop e celular compartilham o banco.
- `tools.spec.ts` usa um servidor só dele (`TOOLS_URL`, porta 4395).
- Playwright fica em `workers: 2` e com espera de 20 s nas verificações de propósito (ver `TESTING.md`, seção 8).
- `office.spec.ts` prepara dados pela API a partir da página e espera 2 s antes de pedir nova leitura (`staleTime`).
- O provedor simulado responde conforme uma palavra na mensagem: `devagar` (resposta longa, para testar streaming e interrupção), `perigo` (resposta com HTML hostil), `anote` (pede a ferramenta de escrever arquivo), `delegue a "<agente>"` (pede delegação) e `delegue devagar a "<agente>"` (delegação longa). Numa execução de tarefa do quadro, quando `move_task` é oferecida, ele move a tarefa para a última etapa listada no briefing (no modelo Desenvolvimento, isso leva a tarefa direto à revisão do usuário).
- `tasks.spec.ts`, `requests.spec.ts`, `templates.spec.ts` e `schedules.spec.ts` usam o servidor `TOOLS_URL` (porta 4395), cujos dados nenhum outro roteiro conta. Antes de criar dados com `api()` logo depois de abrir a página, espere ela carregar (o título): sem a sessão aberta, o navegador registra um 401 no console.
- Para importar um arquivo baixado, passe `await download.path()` a `setInputFiles` (sem `Buffer`).
- Rodar por nome: `npm run test:e2e -w @ea/web -- -g "texto"` (exige `npm run build:e2e -w @ea/web` antes: a compilação normal não tem a página `/referencia`).
- `frame.spec.ts` cria agente, área e tarefa no servidor `TOOLS_URL` com nomes de iniciais raras (Zuleica, Xerografar) para a busca de 3 letras; as capturas do menu e do topo são feitas no servidor vazio, em Configurações, para ficarem estáveis.
- `office.spec.ts` liga a placa de vídeo (`--enable-gpu --use-angle=d3d11`): sem isso o WebGL do Chromium sem janela é por software e a medida de quadros não vale.
- O editor em 3D é testado em `office.spec.ts` pelas marcas `data-editor-item` (piso de cada móvel, nos pixels da tela por `getScreenCTM`); o atributo `data-editor-canvas` diz `3d` ou `svg`.
- `/` abre o Escritório (com WebGL, desenhado por software fora do `office.spec.ts` e do `tools.spec.ts`): teste que só precisa de uma página qualquer abre `/relatorios`, mais leve.
- A coluna do Escritório tem os cartões e a atividade; filtre os agentes dentro da região "Agentes no escritório", porque o nome de um agente também aparece nas linhas da atividade.
- Os indicadores são conferidos em `tasks.spec.ts`, em Relatórios, depois de concluir uma tarefa; o número do cartão é `p.text-3xl` (os outros parágrafos são a comparação e "Como é calculado").
- O quadro é testado em `tasks.spec.ts`: no desktop o cartão é arrastado (`dragTo`) até "Concluído", depois de rolar a coluna para a vista (ela fica além da borda num fluxo de cinco etapas); no celular, pelo botão "Mover para…". Os dois abrem a confirmação.
- O texto do cartão de agente é "Projeto · modelo" (sem vírgula), e sem modelo diz "sem modelo de IA".
- `first-use.spec.ts` usa um servidor só dele (`FIRST_USE_URL`, porta 4396), vazio, e roda só no desktop: os passos mudam a instalação. Ele conta as ações (`act`) e falha acima de `MAX_ACTIONS`.
- `accessibility.spec.ts` passa o axe (WCAG 2.1 A e AA) nas telas de `SCREENS`, nos servidores vazio e com dados; achado crítico ou sério falha. Tela nova entra em `SCREENS`.
- Nos servidores de teste o guia começa sem nada pulado: o cartão "Primeiros passos" e as dicas aparecem. Roteiro que precisa das ações rápidas do Escritório pula o roteiro antes (`PUT /api/guide`), como em `office.spec.ts`.
- `scenery.spec.ts` tem a captura da página do Escritório em 1536×864 (`escritorio-1536x864.png`), a que se compara com a proposta ao fim de cada fase visual.
- `scenery.spec.ts` fixa o relógio com `page.clock.install` (12h e 22h) para as capturas do Escritório de dia e de noite, no servidor vazio.
- Para atualizar capturas, rode o Playwright direto em `apps/web` (`npx playwright test <arquivos> --update-snapshots`, depois de `npm run build:e2e -w @ea/web`): `npm run test:e2e -- --update-snapshots` na raiz entrega a opção à compilação, não ao Playwright.
- `escritorio-recorte.png` nunca se atualiza com `--update-snapshots`: cada ambiente regravaria a imagem e ficaria a do último. Apague o arquivo e rode o teste duas vezes (a primeira grava pelo primeiro ambiente e falha de propósito; a segunda compara os seis).
- `reference.spec.ts` compara cada seção de `/referencia` com as capturas em `reference.spec.ts-snapshots/` (só desktop, nome com `win32`). Depois de uma mudança visual intencional, gere de novo com `--update-snapshots` e olhe as imagens antes do commit.
