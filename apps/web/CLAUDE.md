# apps/web — fatos para o Claude Code

Carregado quando a tarefa toca a interface. As regras gerais estão em `CLAUDE.md` na raiz; o que é só de teste de ponta a ponta está em `e2e/CLAUDE.md`.

## Restrições de renderização

- A CSP proíbe estilos e scripts inline: nunca use o atributo `style` nem carregue recursos de outro domínio. Use classes Tailwind e os tokens de `src/app/theme.css`.
- Saída de modelo só pelo componente `Markdown`. Não habilite HTML bruto nem imagens nele. Saída de modelo e de ferramenta é dado não confiável.
- Nos desenhos SVG do Escritório, não use `<text>` (o texto entra no conteúdo lido da mesa) nem o atributo `style`; uma classe de animação nunca vai no mesmo elemento que tem `transform`.
- Limites e padrões dos campos de agente e projeto vêm de `@ea/shared` (`AGENT_LIMITS`, `AGENT_DEFAULTS`); não repita número nenhum aqui.
- Os passos de ferramenta trazem `toolTitle` no payload: a interface não tem cópia do catálogo de ferramentas.

## Sistema visual (Fase 20)

- Cores, superfícies e escala de tipo em `src/app/theme.css`; `app/theme.test.ts` confere o contraste AA de cada par permitido e falha com tamanho arbitrário de texto (`text-[…]`) fora de `OfficeScene.tsx`. Cor nova que vira texto entra na lista do teste.
- Tons com significado em `src/lib/tone.ts` (`TONES`); o tom de cada estado de agente está em `AGENT_STATE_STYLES`.
- Peças: `StatusPill`, `Sparkline`, `IndicatorCard`, `AgentCard`, `Avatar`, `ActivityFeed`, `QuickAction` (em `src/components/`). Um número na tela sempre vem com "Como é calculado" e um estado sem dados que diz o porquê.
- A página `/referencia` mostra tudo com valores de exemplo e só existe com `import.meta.env.DEV` ou no modo `e2e` (`npm run build:e2e`); `npm run build` não a gera. Peça nova entra nela e em `e2e/reference.spec.ts`.

## Redesenho (Fase 38)

- Paleta grafite com fundo índigo leve; o violeta (`accent`) só marca onde você está, a ação principal e o foco. Os nomes dos tokens são os de antes.
- Fontes: `--font-sans` (Instrument Sans) no texto, `--font-display` (Bricolage Grotesque) no `h1`. Sombras só por `shadow-lift` (superfícies) e `shadow-pop` (o que flutua: modal, menu, aviso temporário); entradas por `animate-pop`, `animate-fade` e `animate-slide-in`.
- Raios: campo e botão `rounded-lg`, painel e cartão `rounded-xl`, modal `rounded-2xl`.
- Telas irmãs de uma seção ganham `SectionTabs` (`components/SectionTabs.tsx`) no topo, não botões no cabeçalho nem link de volta; Tarefas usa `TasksTabs`.
- Um elemento `inline-flex` (como `Switch` ou `Button`) dentro de `space-y-*` não recebe a margem: ponha-o num `div` próprio, ou ele divide a linha com o vizinho.
- `PageHeader` deixa as ações quebrarem linha; numa grade, um filho que pode ser mais largo que a coluna (tabela) precisa de `min-w-0` (o `Panel` já tem).

## Moldura (Fase 21)

- Menu em `app/navigation.ts` (em grupos desde a Fase 38, `NAV_GROUPS`; `NAV_ITEMS` é a lista plana derivada): o item atual vem de `isCurrent` (com `except` para que Tarefas não acenda em `/tarefas/agendamentos`, que é Automações); contadores só onde algo espera o usuário (`counter`). A ajuda é a área planejada `HELP_AREA` (Fase 27), no rodapé do menu, fora do `nav` "Principal".
- O que espera o usuário vem de `useAttention()` (`lib/frame-queries.ts`), que junta aprovações pendentes, `/api/tasks/waiting` e pedidos `pending`; sino e contadores leem dali. `renderApp()` já responde essas listas e o perfil vazios.
- Busca: `app/SearchDialog.tsx`; as telas são procuradas na interface com `searchRank` de `@ea/shared`, o resto em `/api/search`. Tela nova que deva ser achada entra em `SCREENS`.
- No celular o resumo do topo mostra só "precisam de você"; os outros números ficam `sr-only` (os E2E os leem).

## Escritório vivo

O lugar de cada agente é decidido só por `placeOf`/`placesOf` (`src/features/office/scene.ts`) a partir de `/api/office`; não guarde posição de personagem em lugar nenhum (o layout, sim, é gravado: é configuração). O motor (`SceneEngine`) não toca o DOM, trabalha em coordenadas de ladrilho e se testa como função pura; `geometry.ts` liga ele ao layout. Os personagens se movem pelo atributo `transform`, nunca por `style`; a vista é o atributo `viewBox`. A cena é desenhada por bandas de profundidade (`x + y`): um personagem que muda de banda força um novo desenho. Texto na cena (placas, balões, mural) vai em `<foreignObject>`, nunca em `<text>`. Os testes leem, no painel, `data-agent`, `data-place` e `data-seated`; na cena, `data-sitter` (sentado), `data-walker`/`data-moving` (em pé) e `data-area-floor` (piso de cada área).

- Pixel art em `src/components/pixel-art/`: sprite é lista de linhas, um caractere por pixel, cor pela paleta (`palette.ts`). Opção nova de aparência entra no enum de `packages/shared/src/appearance.ts`, na paleta e no teste `pixels.test.tsx`, que desenha toda opção.
- Móvel novo: `ITEM_KINDS`/`ITEM_KIND_INFO` em `packages/shared/src/office.ts` e um caso em `art/furniture.tsx` (que o teste `furniture.test.tsx` desenha em toda direção e cor). Caixas com `tones(cor)` de `art/iso.tsx`, que dá o contorno e os tons dos personagens. Móvel com `colorable` lê a cor por `colorOf`.
- Dia e noite (Fase 23): `daylight.ts` (função pura do horário) e `useDaylight()` nas camadas do entorno; o entorno expõe `data-light`. Muitos elementos repetidos (janelas) vão num `path` por cor.
- Personagem (Fase 22): máscara de materiais de 32 × 64 montada em `figure.ts` (elipses e traços, não pixel a pixel) e sombreada por `shade.ts`; a cor só vem de `materialsOf` em `character.tsx`. Cabeça nas linhas 6 a 23, quadril na 44 (`HIPS`), pés na 63. `sw` e `nw` são desenhadas e `se`/`ne` espelhadas, mas o que tem lado (mão que segura ou levantada, crachá, microfone) é posto depois por `screenSideOf`. Parte nova entra por `part()` (guardada por chave); o teste `pixels.test.tsx` passa toda opção por toda vista, pose e quadro. A página `/referencia` mostra as poses e as opções.
- Escritório 3D (Fase 24): `three/OfficeCanvas.tsx` (React Three Fiber, carregado por `lazy`), `three/view.ts` (câmera como conta pura, usada também pela camada SVG), `three/model.ts` (paredes e volumes dos móveis, em ladrilhos), `three/OfficeOverlay.tsx` (placas, balões, cliques e as marcas que os testes leem, em pixels do palco, por `transform`). Sem WebGL (`hasWebGL()`, sempre falso no jsdom) aparece o `OfficeDrawing` SVG: os testes de componente passam por ele. O que se move segue o motor por `scene.track(id, papel, mover)`. Volume novo entra em `itemBlocks`, que o `model.test.ts` confere em toda direção e cor; volumes do mesmo material são fundidos (`Blocks`). Desde a Fase 25: o acabamento de cada volume vem de `glow`, `opacity` e `finish` (fosco, polido, vidro, aceso); o que acende passa do branco (`GLOW`) para o brilho pegar, e nada mais deve passar. Entorno: o que é do escritório em todo ambiente (chão, degraus, marca, `seeded`) em `three/approach.ts` (testado em `approach.test.ts`); o céu e o `Approach` em `three/Surroundings.tsx`; cada ambiente em `three/environments/` (a cidade em `environments/city/` desde a Fase 34); efeitos em `three/Effects.tsx` (`useFrame` de prioridade 1 desenha pelo compositor; como a cena vai para a textura do compositor e não para a tela, o `antialias` do canvas não vale: a suavização vem da multiamostragem dessa textura, `MSAA_SAMPLES`). A névoa começa depois do canto mais distante do escritório. Móvel 3D (Fase 26): montado com `frameOf(rect, facing).part(u0, u1, v0, v1)`, em que `u` vai de um lado ao outro e `v` do fundo (0) à frente (1); peças podem ser `soft` (cantos arredondados), `leaf`, `ball`, `drum` e girar (`yaw`, `pitch`, `roll`). O `model.test.ts` confere que toda peça fica dentro dos próprios ladrilhos. Personagem 3D (Fase 27): `three/voxel.ts` monta as partes (`voxelFigure`, em voxels em volta de cada junta, `PART_JOINTS`) e as poses (`poseAt`, função pura do tempo; tempo 0 é a pose de "reduzir movimento"); `VoxelCharacter.tsx` desenha e gira as partes. Opção nova de aparência entra também em `voxelFigure`, e o `voxel.test.ts` passa toda opção. Fora da cena, `AgentAvatar` (busto) e a prévia de `AppearanceFields` (corpo inteiro) mostram a foto do personagem voxel por `usePortrait` (`components/use-portrait.ts` → `three/portrait.ts`, um renderizador para todos, foto guardada como `data:`); sem WebGL e no jsdom, o desenho 2D (`PixelBust`, `PixelCharacter`). A geometria do personagem vem de `three/voxel-meshes.ts`, para a cena e para o retrato. Editor 3D (Fase 28): `three/EditorCanvas.tsx` desenha; a camada SVG do editor fica nos pixels de `officeView` e recebe o ponteiro (`unproject` leva o pixel ao ladrilho); o zoom e o arraste mudam o `viewBox` dela e a câmera segue por `zoomedView`. As peças da cena que o editor reaproveita são exportadas de `OfficeCanvas.tsx`.
- Entorno novo: `SURROUNDINGS` em `packages/shared/src/office.ts` e um caso em cada camada de `art/surroundings.tsx`. Nada do entorno é navegável.
- Ambientes 3D (Fase 33): `three/environments/`. Ambiente novo = uma pasta com plano puro (sorteio por `seeded`) e peças puras (`Piece`, de pé no centro; `placed` gira as partes de uma coisa), uma entrada em `registry.ts` e o estado em `catalog.ts` (o editor lê dali o "planejado para a Fase N"). O plano usa `clearance.ts` para pôr cada coisa (`intrudes`, `hidesOffice`, `inSight`) e o teste do ambiente confere todas as peças de dia e de noite em todo layout padrão. Peças viram malhas por `meshes.ts` (fundidas por superfície, sombra assada nos vértices). Ambiente nenhum pede quadro próprio (o que se move, como a água do parque, anda nos quadros que a cena já desenha), nem traz luz de verdade, nem mexe em `Lights`, `Floors`, `Walls`, `Furniture` ou na câmera; os degraus, o brilho sob o piso e a marca são `Approach` (`Surroundings.tsx`), do escritório. Peças comuns (Fase 35): `kit.ts` (árvores, bancos, postes, mesas, `inkOf`), `town.ts` (casas, carros, cercas, faixas do chão e o `townPlanner`, que só aceita o que cumpre `clearance.ts`; o horário entra por `townPieces`) e `scenery.tsx` (`PieceMeshes`, `Water`, `LightPools`, `Lawn`). `windowLit` quer semente em [0, 1). Peça de tamanho zero apaga a cena inteira: `mergedPieces` as descarta. Entorno sem arte 2D própria é desenhado como o mais parecido (`DRAWN` em `art/surroundings.tsx`), com o nome real em `data-surroundings`. `scenery.spec.ts` compara o miolo do escritório nos seis ambientes (`escritorio-recorte.png`) e guarda cidade, bairro, condomínio, ilha e jardim de dia e de noite (`cidade-*.png`, `bairro-*.png`, `condominio-*.png`, `ilha-*.png`, `jardim-*.png`); numa coisa `pieces` do `townPlanner`, todo sorteio fica fora da função que monta as peças, porque ela roda de novo a cada hora; `showIn(page, entorno)` troca o entorno na resposta do servidor, sem gravar.

## Tela inicial (Fase 29)

- `/` leva a `/escritorio`; o Painel é `features/dashboard/DashboardPage.tsx` em `/relatorios`, título "Relatórios".
- A coluna do Escritório (`OfficePanel.tsx`) usa `AgentCard` dentro de cada `li` com `data-agent`/`data-place`/`data-seated`; a ordem é `byUrgency` (`features/office/activity.ts`). O texto de cada cartão começa pelo estado lido do avatar (`sr-only`): nos testes, procure "NomeEstado" sem âncora no começo.
- Clique na cena chama `pick` (seleciona), nunca abre a conversa; o anel do agente aceso é `lit` (`pointed ?? selected`), em 3D no `VoxelCharacter` e `data-lit` na camada SVG.
- Atividade recente: `useActivity()` (`/api/activity`, chave `['activity']`, também atualizada pelo fluxo de eventos) e `activityOf` transforma cada entrada em frase; `ActivityFeed` desenha.
- Abertura do Escritório: o código 3D começa a baixar quando a página monta (`loadCanvas` em `OfficePage.tsx`) e, se já chegou, é usado sem `lazy`, que faria o React segurar a troca do `Suspense` por ~300 ms. Conta cara por ponto de terreno vira marcação a partir de cada objeto (`terrainGeometry` do parque).
- Zoom do Escritório: `useStageZoom` (`features/office/stage-zoom.ts`) guarda o quadro mostrado em frações do desenho; a roda aproxima, o mouse arrasta, e o mesmo quadro move a câmera 3D (`zoomedView`) e o `viewBox` do SVG. Sem botões (D6 da Fase 24).
- `/tarefas?nova=1` e `/tarefas/agendamentos?novo=1` abrem os formulários (ações rápidas); o parâmetro sai do endereço quando o formulário fecha.

## Indicadores (Fase 30)

`features/indicators/IndicatorRow.tsx`: `indicatorViews` (puro) monta o que cada `IndicatorCard` diz a partir de `/api/indicators` (`useIndicators`, chave `['indicators']`); a mesma faixa aparece no Escritório e em Relatórios. Indicador novo entra no esquema de `@ea/shared`, em `indicatorViews` com o seu "Como é calculado" e em `IndicatorRow.test.tsx`. `renderApp()` responde `emptyIndicators` por padrão.

## Telas internas (Fase 31)

- Nenhuma tela (`features/`, `app/`, fora a cena 3D/SVG e a referência) escreve classe de cor de estado (`text-ok`, `bg-fail`, `border-wait`…): `app/theme.test.ts` falha. Estado vai por `StatusPill` (execução: `RunStatusPill`); aviso em caixa por `Notice`; erro de ação por `FormError`; link no texto por `TextLink` ou `LINK`; linha no tom por `ToneText`; o resto por `TONES[tom]` (`text`, `tint`, `dot`, `ink`, `edge`). Selecionado é `glow`, não cor de estado.
- Quadro: `movesOf` (`features/tasks/moves.ts`) repete a regra do servidor para acender as colunas; mudou a regra de mover no servidor, mude aqui e em `moves.test.ts`. Arrastar e "Mover para…" abrem o mesmo `MoveTaskDialog`; nada se move sem confirmar.
- `AgentCard` tem `actions` (pé do cartão, acima do link que o cobre) e `activity` opcional: sem a prop, não há linha de atividade.

## Primeiros passos e Ajuda (Fase 32)

- `useGuide()` (`/api/guide`, chave `['guide']`, relida ao abrir) traz o que foi pulado, as dicas fechadas e `done` de cada etapa; `useGuideActions()` grava (pular, retomar, fechar dica, mostrar de novo). `renderApp()` responde `setUpGuide` (tudo feito, todas as dicas fechadas): teste que quer o cartão ou uma dica passa o seu `/api/guide`.
- Dica nova: id em `TIP_IDS` (`@ea/shared`) e `<Tip id="…">` na tela; `Tip.test.tsx` confere que todo id tem lugar.
- Formulário que um link abre pelo endereço: `useAddressFlag(nome)` (`lib/address-flag.ts`).
- A Ajuda mostra `docs/GUIA.md` (importado com `?raw`): mudar o guia muda a tela; título novo ganha âncora por `anchorOf`, do jeito do GitHub, e o `HelpPage.test.tsx` confere que todo link do sumário acha o seu título.
- Área que rola recebe `tabIndex={0}` (o axe cobra); nome acessível de botão contém o texto visível.

## Quadro de tarefas (Fase 16)

Telas em `src/features/tasks/` (quadro em `/tarefas?area=<id>`, tarefa em `/tarefas/:taskId`, fluxo em `/tarefas/fluxo/:areaId`); consultas em `src/lib/task-queries.ts`, com atualização a cada 3 s enquanto agentes trabalham. Texto de tarefa, nota e comentário vêm de pessoas e modelos: só pelo `Markdown`. O editor de fluxo valida com `workflowUpdateSchema` antes de enviar. Pedidos entre áreas (Fase 17) ficam em `/tarefas/pedidos` (`RequestsPage.tsx`) os modelos de fluxo (Fase 18) em `/tarefas/modelos` (`TemplatesPage.tsx`) e os agendamentos (Fase 19) em `/tarefas/agendamentos` (`SchedulesPage.tsx`, com `describeRule` para a repetição por extenso), todas declaradas antes de `/tarefas/:taskId`. O que um modelo cria aparece por `TemplateDetails.tsx`, usado no catálogo e em "Nova área a partir de modelo". Baixar um arquivo: `download()` de `src/lib/download.ts`. No Escritório, `visit` do agente vira o lugar `room` (sala da outra área) só enquanto `until` não passou e a área tem sala no layout.

## Testes de componente

- Use `renderApp()` de `src/test/render.tsx`, que monta as rotas reais sobre uma API simulada.
- Em `renderApp()`, uma requisição com query string também casa com a entrada do caminho sem ela.
- Quem precisa de eventos do servidor usa `installFakeEventSource()` (`src/test/fake-event-source.ts`); sem ele, `EventSource` não existe no jsdom e as telas caem na consulta periódica.
- `Panel` rotula a própria região com o título: use `getByRole('region', { name: título })`.
