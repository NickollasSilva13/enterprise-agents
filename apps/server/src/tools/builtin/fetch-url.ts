import { z } from 'zod';
import { fetchPublicUrl, htmlToText, NetGuardError, type NetGuardOptions } from '../net-guard';
import { type ToolDefinition, toolError } from '../types';

const MAX_CHARS = 40_000;

export function createFetchUrlTool(options: NetGuardOptions = {}): ToolDefinition<{ url: string }> {
  return {
    name: 'fetch_url',
    title: 'Buscar URL',
    summary:
      'Lê páginas e dados públicos da internet. Endereços desta máquina e da rede local são bloqueados.',
    description:
      'Busca o texto de um endereço http ou https público. Páginas HTML são devolvidas como texto simples.',
    risk: 'medium',
    inputSchema: z.strictObject({ url: z.string().min(1).max(2000) }),
    async execute(input, context) {
      let page;
      try {
        page = await fetchPublicUrl(input.url.trim(), context.signal, options);
      } catch (error) {
        if (error instanceof NetGuardError) return toolError(error.message);
        throw error;
      }
      const text = /html/i.test(page.contentType) ? htmlToText(page.body) : page.body;
      const cut = text.length > MAX_CHARS || page.truncated;
      const body = `${text.slice(0, MAX_CHARS)}${cut ? '\n\n[Conteúdo cortado por tamanho.]' : ''}`;
      if (page.status >= 400) {
        return toolError(`O servidor respondeu com o código ${page.status}.\n${body}`);
      }
      return { content: body === '' ? '(resposta vazia)' : body };
    },
  };
}
