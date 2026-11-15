import { mkdir, open, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { type ToolDefinition, toolError } from '../types';
import { PATH_LIMIT, resolveInWorkspace, toWorkspacePath } from '../workspace';

// Size limits of SECURITY C-18.
export const FILE_LIMITS = {
  readBytes: 256 * 1024,
  writeChars: 1_000_000,
  listEntries: 500,
} as const;

const path = z.string().min(1).max(PATH_LIMIT);

const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

export const readFileTool: ToolDefinition<{ path: string }> = {
  name: 'read_file',
  title: 'Ler arquivo',
  summary: 'Lê arquivos de texto da pasta de trabalho do agente.',
  description:
    'Lê um arquivo de texto da sua pasta de trabalho. Use um caminho relativo, por exemplo "notas/resumo.md".',
  risk: 'low',
  inputSchema: z.strictObject({ path }),
  async execute(input, context) {
    const absolute = resolveInWorkspace(context.workspaceDir, input.path);
    let handle;
    try {
      handle = await open(absolute, 'r');
    } catch {
      return toolError(`O arquivo "${input.path}" não existe.`);
    }
    try {
      const info = await handle.stat();
      if (!info.isFile()) return toolError(`"${input.path}" não é um arquivo.`);
      const size = Math.min(info.size, FILE_LIMITS.readBytes);
      const buffer = Buffer.alloc(size);
      await handle.read(buffer, 0, size, 0);
      if (buffer.includes(0)) {
        return toolError(`"${input.path}" não é um arquivo de texto.`);
      }
      const text = buffer.toString('utf8');
      return {
        content:
          info.size > FILE_LIMITS.readBytes
            ? `${text}\n\n[Arquivo cortado: só os primeiros ${kb(FILE_LIMITS.readBytes)} de ${kb(info.size)} foram lidos.]`
            : text,
      };
    } finally {
      await handle.close();
    }
  },
};

export const listDirTool: ToolDefinition<{ path?: string | undefined }> = {
  name: 'list_dir',
  title: 'Listar pasta',
  summary: 'Lista os arquivos e pastas da pasta de trabalho do agente.',
  description:
    'Lista o conteúdo de uma pasta da sua pasta de trabalho. Sem "path", lista a raiz. Pastas terminam com "/".',
  risk: 'low',
  inputSchema: z.strictObject({ path: path.optional() }),
  async execute(input, context) {
    const absolute = resolveInWorkspace(context.workspaceDir, input.path ?? '.');
    let entries;
    try {
      entries = await readdir(absolute, { withFileTypes: true });
    } catch {
      return toolError(`A pasta "${input.path ?? '.'}" não existe.`);
    }
    if (entries.length === 0) return { content: '(pasta vazia)' };

    entries.sort((a, b) => a.name.localeCompare(b.name));
    const shown = entries.slice(0, FILE_LIMITS.listEntries);
    const lines: string[] = [];
    for (const entry of shown) {
      if (entry.isDirectory()) {
        lines.push(`${entry.name}/`);
      } else if (entry.isFile()) {
        const info = await stat(`${absolute}/${entry.name}`).catch(() => null);
        lines.push(info ? `${entry.name} (${info.size} bytes)` : entry.name);
      } else {
        // Links and other special entries are named, never followed.
        lines.push(`${entry.name} (link ou item especial)`);
      }
    }
    if (entries.length > shown.length) {
      lines.push(`[… mais ${entries.length - shown.length} itens não listados]`);
    }
    return { content: lines.join('\n') };
  },
};

export const writeFileTool: ToolDefinition<{ path: string; content: string }> = {
  name: 'write_file',
  title: 'Escrever arquivo',
  summary: 'Cria ou substitui arquivos de texto na pasta de trabalho do agente.',
  description:
    'Cria ou substitui um arquivo de texto na sua pasta de trabalho. Pastas que faltam são criadas. Use um caminho relativo.',
  risk: 'medium',
  inputSchema: z.strictObject({
    path,
    content: z
      .string()
      .max(
        FILE_LIMITS.writeChars,
        `O conteúdo pode ter no máximo ${FILE_LIMITS.writeChars} caracteres.`,
      ),
  }),
  async execute(input, context) {
    const absolute = resolveInWorkspace(context.workspaceDir, input.path);
    const existing = await stat(absolute).catch(() => null);
    if (existing && !existing.isFile()) {
      return toolError(`"${input.path}" é uma pasta, não um arquivo.`);
    }
    await mkdir(dirname(absolute), { recursive: true });
    // The folders were just created: check again that none of them is a link
    // leading out of the workspace before anything is written.
    const checked = resolveInWorkspace(context.workspaceDir, input.path);
    await writeFile(checked, input.content, { encoding: 'utf8', signal: context.signal });
    return {
      content: `Arquivo "${toWorkspacePath(context.workspaceDir, checked)}" ${existing ? 'substituído' : 'criado'} (${Buffer.byteLength(input.content)} bytes).`,
    };
  },
};
