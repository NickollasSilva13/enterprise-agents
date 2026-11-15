import { lstatSync, mkdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** A path the agent may not use. The message is shown to the model. */
export class WorkspacePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkspacePathError';
  }
}

export const PATH_LIMIT = 400;

// Device names that Windows resolves to devices whatever the folder or extension.
const RESERVED_NAMES = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;

/** True if `target` is `root` or lies inside it. Both must be absolute. */
function isInside(root: string, target: string): boolean {
  const offset = relative(root, target);
  return offset === '' || (!offset.startsWith('..') && !isAbsolute(offset));
}

function assertSegment(segment: string): void {
  if (segment === '..') {
    throw new WorkspacePathError('O caminho não pode sair da pasta de trabalho ("..").');
  }
  // On Windows, "name:stream" is an alternate data stream and "C:" a drive.
  if (segment.includes(':')) {
    throw new WorkspacePathError('O caminho não pode conter ":".');
  }
  if (/[<>"|?*]/.test(segment)) {
    throw new WorkspacePathError('O caminho contém caracteres não permitidos.');
  }
  // Windows drops trailing dots and spaces, so "nul." and "nul " are still the device.
  const base = segment.replace(/[. ]+$/, '');
  if (base !== segment) {
    throw new WorkspacePathError('Nomes não podem terminar com ponto ou espaço.');
  }
  if (RESERVED_NAMES.test(base.split('.', 1)[0] ?? '')) {
    throw new WorkspacePathError(`"${segment}" é um nome reservado do sistema.`);
  }
}

/**
 * The folder itself, created if needed, with links resolved. Everything the
 * agent touches is compared against this.
 */
export function ensureWorkspace(dir: string): string {
  mkdirSync(dir, { recursive: true });
  return realpathSync(dir);
}

/**
 * Turns a path written by the model into an absolute path that is certain to
 * be inside the agent's working folder (SECURITY C-17). The model's text is
 * never trusted: absolute paths, "..", drive letters, device names and links
 * that lead out of the folder are all refused.
 *
 * The check is on the real location: the deepest part of the path that
 * already exists is resolved through any symbolic links or junctions, and
 * the result must still be inside the folder.
 */
export function resolveInWorkspace(workspaceDir: string, requested: string): string {
  if (requested.length > PATH_LIMIT) throw new WorkspacePathError('O caminho é longo demais.');
  if (requested.includes('\0')) throw new WorkspacePathError('O caminho é inválido.');

  const normalized = requested.replace(/\\/g, '/').trim();
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || isAbsolute(requested)) {
    throw new WorkspacePathError(
      'Use um caminho relativo à pasta de trabalho, sem barra inicial nem letra de unidade.',
    );
  }
  const segments = normalized.split('/').filter((segment) => segment !== '' && segment !== '.');
  segments.forEach(assertSegment);

  const root = ensureWorkspace(workspaceDir);
  const target = resolve(root, ...segments);
  if (!isInside(root, target)) {
    throw new WorkspacePathError('O caminho sai da pasta de trabalho.');
  }

  // Walk up to the deepest existing ancestor and resolve it for real.
  let existing = target;
  for (;;) {
    try {
      lstatSync(existing);
      break;
    } catch {
      const parent = dirname(existing);
      if (parent === existing) break;
      existing = parent;
    }
  }
  const real = realpathSync(existing);
  if (!isInside(root, real)) {
    throw new WorkspacePathError('O caminho passa por um link que sai da pasta de trabalho.');
  }
  // The part that does not exist yet cannot contain links.
  return join(real, relative(existing, target));
}

/** The path as the agent should see it: relative, with forward slashes. */
export function toWorkspacePath(workspaceDir: string, absolute: string): string {
  return relative(realpathSync(workspaceDir), absolute).split(sep).join('/') || '.';
}
