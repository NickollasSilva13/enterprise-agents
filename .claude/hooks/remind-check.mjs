// Stop: se o turno deixou código alterado, lembra de rodar `npm run check`
// (regra de processo 7 do CLAUDE.md). Só avisa; nunca bloqueia.
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const git = spawnSync('git', ['status', '--porcelain'], {
  cwd: root,
  encoding: 'utf8',
  timeout: 15_000,
});

if (git.status === 0) {
  const touched = git.stdout
    .split('\n')
    .map((line) => line.slice(3).trim())
    .filter((path) => /^(apps|packages)\/.*\.(ts|tsx|css|json|sql)$/.test(path));

  if (touched.length > 0) {
    process.stdout.write(
      JSON.stringify({
        systemMessage: `Há ${touched.length} arquivo(s) alterado(s) em apps/ ou packages/. Rode \`npm run check\` antes de encerrar.`,
        suppressOutput: true,
      }),
    );
  }
}
