# apps/web/e2e — fatos para o Claude Code

Carregado quando a tarefa toca os testes de ponta a ponta.

- Os arquivos desta pasta não têm os tipos do Node: nada de `node:fs` nem `Buffer`.
- Prepare dados com `api()` de `helpers.ts` (refaz a sessão em 401).
- Antes de rodar, as portas 4391 a 4395 precisam estar livres, e nenhum servidor de desenvolvimento pode estar em segundo plano: `tsx watch` reinicia sozinho e ocupa a porta 4317.
- Testes que alteram dados usam o servidor `CRUD_URL` (porta 4393) e colocam o nome do projeto do Playwright nos nomes que criam, porque desktop e celular compartilham o banco.
- `tools.spec.ts` usa um servidor só dele (`TOOLS_URL`, porta 4395).
- Playwright fica em `workers: 2` e com espera de 20 s nas verificações de propósito (ver `TESTING.md`, seção 8).
- `office.spec.ts` prepara dados pela API a partir da página e espera 2 s antes de pedir nova leitura (`staleTime`).
- O provedor simulado responde conforme uma palavra na mensagem: `devagar` (resposta longa, para testar streaming e interrupção), `perigo` (resposta com HTML hostil), `anote` (pede a ferramenta de escrever arquivo), `delegue a "<agente>"` (pede delegação) e `delegue devagar a "<agente>"` (delegação longa). Numa execução de tarefa do quadro, quando `move_task` é oferecida, ele move a tarefa para a última etapa listada no briefing (no modelo Desenvolvimento, isso leva a tarefa direto à revisão do usuário).
- `tasks.spec.ts` e `requests.spec.ts` usam o servidor `TOOLS_URL` (porta 4395), cujos dados nenhum outro roteiro conta. Antes de criar dados com `api()` logo depois de abrir a página, espere ela carregar (o título): sem a sessão aberta, o navegador registra um 401 no console.
- Rodar por nome: `npm run test:e2e -w @ea/web -- -g "texto"` (exige `npm run build` antes).
