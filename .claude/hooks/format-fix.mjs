// PostToolUse (Write|Edit): formata e corrige o arquivo recém-escrito, para que
// `npm run lint` não falhe depois por causa de espaçamento ou regra autocorrigível.
// Nunca falha a ferramenta: qualquer erro aqui sai em silêncio.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FORMAT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.css', '.html']);
const LINT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs']);

function stdin() {
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return null;
  }
}

function run(script, args) {
  spawnSync(process.execPath, [resolve(root, script), ...args], {
    cwd: root,
    stdio: 'ignore',
    timeout: 60_000,
  });
}

const payload = stdin();
const file = payload?.tool_response?.filePath ?? payload?.tool_input?.file_path;
if (file) {
  const abs = resolve(file);
  const rel = relative(root, abs);
  const inside = rel && !rel.startsWith('..');
  const ext = extname(abs);
  if (inside && existsSync(abs) && FORMAT.has(ext)) {
    run('node_modules/prettier/bin/prettier.cjs', ['--write', '--ignore-unknown', abs]);
    if (LINT.has(ext)) {
      run('node_modules/eslint/bin/eslint.js', ['--fix', '--no-warn-ignored', abs]);
    }
  }
}
