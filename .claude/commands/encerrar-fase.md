---
description: Fecha a fase em curso - checagem, documentação viva e relatório de parada
argument-hint: "[número da fase]"
---

Encerre a fase $1 (se vazio, a fase em curso segundo `ROADMAP.md`) seguindo as regras de processo 2, 4 e 6 do `CLAUDE.md`. Não comece nada da fase seguinte.

1. Rode `npm run check` e relate a saída real. Se falhar, conserte antes de seguir.
2. Confira se o que a fase pedia em `ROADMAP.md` está realmente entregue e se nada ficou fictício na interface (regra 5).
3. Atualize a documentação viva:
   - `ROADMAP.md`: estado da fase e pendências que sobraram;
   - `SECURITY.md`, seção 9: controles novos ou alterados (com o teste que os cobre);
   - `TESTING.md`, seção 7: o que passou a ser testado e como;
   - `README.md`: a linha de estado e a tabela de funcionalidades, se mudaram;
   - os `CLAUDE.md` de área (`apps/server`, `apps/web`, `apps/web/e2e`): fato novo que não é óbvio pelo código.
4. Apresente o relatório de parada: o que foi feito; arquivos criados ou modificados; decisões técnicas; testes executados e resultados reais; problemas e pendências; resumo; o que vem na próxima fase.
5. Pergunte explicitamente se pode prosseguir e aguarde.
