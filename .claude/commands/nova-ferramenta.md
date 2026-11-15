---
description: Cria uma ferramenta de agente completa - definição, registro, permissões e testes
argument-hint: "<nome-da-ferramenta> <o que ela faz>"
---

Implemente a ferramenta de agente: $ARGUMENTS

Leia antes `apps/server/CLAUDE.md` (seção Ferramentas), `SECURITY.md` e um exemplo existente em `apps/server/src/tools/builtin/`.

Exigências, sem atalho:

1. `ToolDefinition` em `apps/server/src/tools/builtin/<nome>.ts`, com esquema Zod dos argumentos, título, descrição e nível de risco coerente com o que a ferramenta faz.
2. Registro em `createBuiltinRegistry()`. O único caminho de execução é `RunManager.dispatch`; não chame `execute` por fora.
3. A ferramenta recebe só `ToolContext`. Caminho vindo do modelo passa por `resolveInWorkspace`; endereço vindo do modelo, por `fetchPublicUrl`. Processo externo é criado sem shell, com argumentos em lista.
4. Testes ao lado: argumentos inválidos, caminho fora da pasta de trabalho, decisão do `PermissionEngine` (`deny`, `ask` com aprovação e com recusa, `allow`) usando `grantTools()`.
5. Se a ferramenta é um controle novo ou mexe em um existente, atualize `SECURITY.md` e diga qual teste o cobre.
6. Rode `npm run check` e relate a saída real.
