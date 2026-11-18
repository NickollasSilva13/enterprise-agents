# apps/web — fatos para o Claude Code

Carregado quando a tarefa toca a interface. As regras gerais estão em `CLAUDE.md` na raiz; o que é só de teste de ponta a ponta está em `e2e/CLAUDE.md`.

## Restrições de renderização

- A CSP proíbe estilos e scripts inline: nunca use o atributo `style` nem carregue recursos de outro domínio. Use classes Tailwind e os tokens de `src/app/theme.css`.
- Saída de modelo só pelo componente `Markdown`. Não habilite HTML bruto nem imagens nele. Saída de modelo e de ferramenta é dado não confiável.
- Nos desenhos SVG do Escritório, não use `<text>` (o texto entra no conteúdo lido da mesa) nem o atributo `style`; uma classe de animação nunca vai no mesmo elemento que tem `transform`.
- Limites e padrões dos campos de agente e projeto vêm de `@ea/shared` (`AGENT_LIMITS`, `AGENT_DEFAULTS`); não repita número nenhum aqui.
- Os passos de ferramenta trazem `toolTitle` no payload: a interface não tem cópia do catálogo de ferramentas.

## Escritório vivo

O lugar de cada agente é decidido só por `placeOf`/`placesOf` (`src/features/office/scene.ts`) a partir de `/api/office`; não guarde posição de personagem em lugar nenhum (o layout, sim, é gravado: é configuração). O motor (`SceneEngine`) não toca o DOM, trabalha em coordenadas de ladrilho e se testa como função pura; `geometry.ts` liga ele ao layout. Os personagens se movem pelo atributo `transform`, nunca por `style`; a vista é o atributo `viewBox`. A cena é desenhada por bandas de profundidade (`x + y`): um personagem que muda de banda força um novo desenho. Texto na cena (placas, balões, mural) vai em `<foreignObject>`, nunca em `<text>`. Os testes leem, no painel, `data-agent`, `data-place` e `data-seated`; na cena, `data-sitter` (sentado), `data-walker`/`data-moving` (em pé) e `data-area-floor` (piso de cada área).

- Pixel art em `src/components/pixel-art/`: sprite é lista de linhas, um caractere por pixel, cor pela paleta (`palette.ts`). Opção nova de aparência entra no enum de `packages/shared/src/appearance.ts`, na paleta e no teste `pixels.test.tsx`, que desenha toda opção.
- Móvel novo: `ITEM_KINDS`/`ITEM_KIND_INFO` em `packages/shared/src/office.ts` e um caso em `art/furniture.tsx`.
- Personagem (Fase 15): sprites de 20 × 40 montados com `place(linha, linhas)` em `character.tsx`; linha 0 é o alto da cabeça e há 4 linhas acima para cabelo alto. Só as vistas `sw` e `nw` são desenhadas; `se` e `ne` são espelho. O teste `pixels.test.tsx` confere o tamanho de todo sprite (`ALL_SPRITES`).
- Entorno novo: `SURROUNDINGS` em `packages/shared/src/office.ts` e um caso em cada camada de `art/surroundings.tsx`. Nada do entorno é navegável.

## Quadro de tarefas (Fase 16)

Telas em `src/features/tasks/` (quadro em `/tarefas?area=<id>`, tarefa em `/tarefas/:taskId`, fluxo em `/tarefas/fluxo/:areaId`); consultas em `src/lib/task-queries.ts`, com atualização a cada 3 s enquanto agentes trabalham. Texto de tarefa, nota e comentário vêm de pessoas e modelos: só pelo `Markdown`. O editor de fluxo valida com `workflowUpdateSchema` antes de enviar. Pedidos entre áreas (Fase 17) ficam em `/tarefas/pedidos` (`RequestsPage.tsx`), declarada antes de `/tarefas/:taskId`. No Escritório, `visit` do agente vira o lugar `room` (sala da outra área) só enquanto `until` não passou e a área tem sala no layout.

## Testes de componente

- Use `renderApp()` de `src/test/render.tsx`, que monta as rotas reais sobre uma API simulada.
- Em `renderApp()`, uma requisição com query string também casa com a entrada do caminho sem ela.
- Quem precisa de eventos do servidor usa `installFakeEventSource()` (`src/test/fake-event-source.ts`); sem ele, `EventSource` não existe no jsdom e as telas caem na consulta periódica.
- `Panel` rotula a própria região com o título: use `getByRole('region', { name: título })`.
