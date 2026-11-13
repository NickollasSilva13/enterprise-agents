import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import {
  CRUD_PORT,
  EMPTY_PORT,
  FAKE_PROVIDER_KEY,
  FAKE_PROVIDER_PORT,
  SEEDED_PORT,
} from './e2e/servers';

const serverDir = fileURLToPath(new URL('../server', import.meta.url));
const dataRoot = fileURLToPath(new URL('./e2e/.e2e-data', import.meta.url));

/** A real server on its own port and its own freshly created database. */
const server = (name: string, port: number, seed: boolean) => ({
  command: `npx tsx scripts/prepare-e2e-data.ts${seed ? ' --seed' : ''} && npx tsx src/main.ts`,
  cwd: serverDir,
  url: `http://127.0.0.1:${port}/`,
  env: {
    NODE_ENV: 'production',
    APP_PORT: String(port),
    DATA_DIR: join(dataRoot, name),
    LOG_LEVEL: 'error',
    // Test keys stay in memory, away from the real credential vault.
    SECRET_STORE: 'memory',
  },
  reuseExistingServer: false,
  timeout: 60_000,
});

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  // Deliberately low. On the development machine, 8 headless browsers in
  // parallel made page loads hang even against a bare Node HTTP server
  // (see TESTING.md, "Problemas conhecidos"). Two are reliable.
  workers: 2,
  forbidOnly: true,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
  webServer: [
    server('empty', EMPTY_PORT, false),
    server('seeded', SEEDED_PORT, true),
    server('crud', CRUD_PORT, false),
    {
      command: 'node e2e/fake-provider.mjs',
      url: `http://127.0.0.1:${FAKE_PROVIDER_PORT}/api/version`,
      env: { FAKE_PROVIDER_PORT: String(FAKE_PROVIDER_PORT), FAKE_PROVIDER_KEY },
      reuseExistingServer: false,
    },
  ],
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
