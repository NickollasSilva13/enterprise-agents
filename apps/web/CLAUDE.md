# apps/web — fatos para o Claude Code

Carregado quando a tarefa toca a interface. As regras gerais estão em `CLAUDE.md` na raiz; o que é só de teste de ponta a ponta está em `e2e/CLAUDE.md`.

## Restrições de renderização

- A CSP proíbe estilos e scripts inline: nunca use o atributo `style` nem carregue recursos de outro domínio. Use classes Tailwind e os tokens de `src/app/theme.css`.
- Saída de modelo só pelo componente `Markdown`. Não habilite HTML bruto nem imagens nele. Saída de modelo e de ferramenta é dado não confiável.
- Nos desenhos SVG do Escritório, não use `<text>` (o texto entra no conteúdo lido da mesa) nem o atributo `style`; uma classe de animação nunca vai no mesmo elemento que tem `transform`.
- Limites e padrões dos campos de agente e projeto vêm de `@ea/shared` (`AGENT_LIMITS`, `AGENT_DEFAULTS`); não repita número nenhum aqui.
- Os passos de ferramenta trazem `toolTitle` no payload: a interface não tem cópia do catálogo de ferramentas.

## Escritório vivo

O lugar de cada agente é decidido só por `placeOf` (`src/features/office/scene.ts`) a partir de `/api/office`; não guarde posição em lugar nenhum. O motor (`SceneEngine`) não toca o DOM e se testa como função pura; os personagens se movem pelo atributo `transform`, nunca por `style`. Os testes leem `data-place` e `data-seated` (na mesa) e `data-walker`/`data-moving` (no personagem).

## Testes de componente

- Use `renderApp()` de `src/test/render.tsx`, que monta as rotas reais sobre uma API simulada.
- Em `renderApp()`, uma requisição com query string também casa com a entrada do caminho sem ela.
- Quem precisa de eventos do servidor usa `installFakeEventSource()` (`src/test/fake-event-source.ts`); sem ele, `EventSource` não existe no jsdom e as telas caem na consulta periódica.
- `Panel` rotula a própria região com o título: use `getByRole('region', { name: título })`.
