import { copyFileSync, lstatSync, mkdirSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { REQUEST_LIMITS } from '@ea/shared';

// Files that go from one area to another with a request (Phase 17, D3). An
// area never reaches into another's folder: what is sent is copied, and only
// by the server, between folders it names itself. The sources were already
// confined by the path resolver (C-17); links met while walking a folder are
// skipped, so a copy can never follow one out of it.

/** Why a copy was refused. The message is shown to the model and the user. */
export class AreaCopyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AreaCopyError';
  }
}

interface Planned {
  readonly source: string;
  readonly target: string;
}

export interface CopyResult {
  readonly files: number;
  readonly bytes: number;
}

interface Tally {
  files: number;
  bytes: number;
}

function plan(source: string, target: string, out: Planned[], tally: Tally): void {
  const stat = lstatSync(source);
  if (stat.isSymbolicLink()) return;
  if (stat.isDirectory()) {
    for (const name of readdirSync(source))
      plan(join(source, name), join(target, name), out, tally);
    return;
  }
  if (!stat.isFile()) return;
  tally.files += 1;
  tally.bytes += stat.size;
  if (tally.files > REQUEST_LIMITS.files) {
    throw new AreaCopyError(
      `São mais de ${REQUEST_LIMITS.files} arquivos, o limite de uma cópia entre áreas.`,
    );
  }
  if (tally.bytes > REQUEST_LIMITS.bytes) {
    throw new AreaCopyError(
      `Os arquivos passam de ${REQUEST_LIMITS.bytes / (1024 * 1024)} MB, o limite de uma cópia entre áreas.`,
    );
  }
  out.push({ source, target });
}

/** Checks everything first, so a copy over the limits leaves nothing half done. */
function run(pairs: readonly { source: string; target: string }[]): CopyResult {
  const planned: Planned[] = [];
  const tally: Tally = { files: 0, bytes: 0 };
  for (const pair of pairs) plan(pair.source, pair.target, planned, tally);
  for (const entry of planned) {
    mkdirSync(dirname(entry.target), { recursive: true });
    copyFileSync(entry.source, entry.target);
  }
  return tally;
}

/**
 * Copies files and folders, each into `destDir` under its own name. The
 * sources must be absolute paths that already went through the resolver.
 */
export function copyIntoFolder(sources: readonly string[], destDir: string): CopyResult {
  const pairs = sources.map((source) => {
    try {
      lstatSync(source);
    } catch {
      throw new AreaCopyError(`"${basename(source)}" não existe.`);
    }
    return { source, target: join(destDir, basename(source)) };
  });
  if (pairs.length === 0) return { files: 0, bytes: 0 };
  return run(pairs);
}

/** Copies what is inside `sourceDir` to `destDir`; nothing when it does not exist. */
export function copyFolderContents(sourceDir: string, destDir: string): CopyResult {
  let names: string[];
  try {
    if (!lstatSync(sourceDir).isDirectory()) return { files: 0, bytes: 0 };
    names = readdirSync(sourceDir);
  } catch {
    return { files: 0, bytes: 0 };
  }
  return run(names.map((name) => ({ source: join(sourceDir, name), target: join(destDir, name) })));
}
