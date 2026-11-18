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

// ---- The area's shared folder (Phase 16, D6) -----------------------------------

/** First segment of a path that means the area's shared folder. */
export const AREA_PREFIX = 'area';

/** The two folders a file tool may use, and what it may do in the second. */
export interface PathScope {
  readonly workspaceDir: string;
  readonly area: { readonly dir: string; readonly canWrite: boolean } | null;
}

export interface ResolvedPath {
  readonly absolute: string;
  /** The folder the path is confined to. */
  readonly root: string;
  readonly inArea: boolean;
}

/**
 * Like `resolveInWorkspace`, with a second root: a path whose first segment
 * is "area" goes to the area's shared folder, and only if the agent was given
 * access to it, for writing only if it may write there. The rest of the path
 * then goes through `resolveInWorkspace` against that folder, so every rule
 * of SECURITY C-17 holds for it as well. Any other path stays in the agent's
 * own folder, as before. The prefix is matched ignoring case, so it cannot be
 * dodged on a case-insensitive file system.
 */
export function resolveToolPath(
  scope: PathScope,
  requested: string,
  mode: 'read' | 'write',
): ResolvedPath {
  const normalized = requested.replace(/\\/g, '/').trim();
  const segments = normalized.split('/').filter((segment) => segment !== '' && segment !== '.');
  const startsAtRoot = normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized);
  if (startsAtRoot || segments[0]?.toLowerCase() !== AREA_PREFIX) {
    return {
      absolute: resolveInWorkspace(scope.workspaceDir, requested),
      root: scope.workspaceDir,
      inArea: false,
    };
  }
  if (!scope.area) {
    throw new WorkspacePathError(
      'Você não tem acesso à pasta da área: caminhos que começam com "area/" são dela.',
    );
  }
  if (mode === 'write' && !scope.area.canWrite) {
    throw new WorkspacePathError('Você pode ler a pasta da área, mas não escrever nela.');
  }
  const rest = segments.slice(1).join('/') || '.';
  return {
    absolute: resolveInWorkspace(scope.area.dir, rest),
    root: scope.area.dir,
    inArea: true,
  };
}

/** A resolved path as the agent should see it, with the "area/" prefix when it has one. */
export function toToolPath(resolved: ResolvedPath): string {
  const inside = toWorkspacePath(resolved.root, resolved.absolute);
  if (!resolved.inArea) return inside;
  return inside === '.' ? AREA_PREFIX : `${AREA_PREFIX}/${inside}`;
}
