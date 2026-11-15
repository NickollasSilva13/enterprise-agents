---
description: Cria um adaptador de ModelProvider com testes de contrato e servidor de teste
argument-hint: "<nome do provedor> [endereço da API]"
---

Implemente o adaptador de provedor de modelos: $ARGUMENTS

Leia antes `apps/server/CLAUDE.md` (seção Provedores), a interface `ModelProvider` e um adaptador existente em `apps/server/src/providers/`.

Exigências:

1. Novo adaptador em `apps/server/src/providers/`, implementando `ModelProvider` por inteiro (listar modelos, completar, streaming, ferramentas se o provedor as aceita).
2. A chave vem sempre do `SecretStore` e é passada explicitamente ao cliente; nunca do ambiente, nunca do banco, nunca no log.
3. Resposta do provedor validada com Zod. Erro sai só como `ProviderError`, sem texto do provedor na mensagem; quem loga usa `redactSecrets`.
4. Testes de contrato compartilhados mais um servidor HTTP de teste em `apps/server/test/stub-servers.ts`: resposta normal, streaming, erro de autenticação, erro de rede, resposta fora do formato.
5. Rode `npm run check` e relate a saída real. Diga claramente se o adaptador foi ou não validado contra o serviço real.
