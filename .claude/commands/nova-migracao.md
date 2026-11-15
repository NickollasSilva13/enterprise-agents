---
description: Gera uma migração do banco a partir do esquema, ou uma personalizada para SQL à mão
argument-hint: "<nome-em-ingles> [--custom]"
---

Crie a migração: $ARGUMENTS

Regras:

1. Mudança de esquema comum: altere o esquema Drizzle em `apps/server/src/db/` primeiro, depois `npm run db:generate`. Nunca escreva o arquivo de migração à mão.
2. SQL que o Drizzle não gera (gatilho, índice parcial, checagem): `npx drizzle-kit generate --custom --name <nome>` dentro de `apps/server`, e só então preencha o arquivo gerado.
3. Migração já aplicada nunca é editada — o hook `guard-migrations` bloqueia isso. Se o que já existe está errado, corrija com uma migração nova.
4. Aplique com `npm run db:migrate` e rode os testes do banco: `npm test -w @ea/server -- test/db.test.ts`.
5. Se a migração cria um controle (como a tabela de auditoria apenas-inserção), atualize `SECURITY.md` e acrescente o teste que o prova.
