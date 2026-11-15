// Remove o que builds e testes deixam no disco. Nada em `data/` é tocado:
// lá ficam os dados reais da instalação local.
import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  'apps/web/dist',
  'apps/web/test-results',
  'apps/web/playwright-report',
  'apps/web/e2e/.e2e-data',
  'apps/server/coverage',
  'coverage',
];

for (const target of targets) {
  rmSync(resolve(root, target), { recursive: true, force: true });
  console.log(`removido: ${target}`);
}
