import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

const repoRoot = fileURLToPath(new URL('../../', import.meta.url));

export default defineConfig(({ mode }) => {
  // Same optional ".env" the server reads, so both agree on the ports.
  const env = loadEnv(mode, repoRoot, '');
  const apiPort = Number(env.APP_PORT || 4317);
  const webPort = Number(env.WEB_DEV_PORT || 5173);

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: '127.0.0.1',
      port: webPort,
      strictPort: true,
      proxy: {
        // changeOrigin makes the proxied Host header match the server's allowlist.
        '/api': { target: `http://127.0.0.1:${apiPort}`, changeOrigin: true },
      },
    },
    test: {
      environment: 'jsdom',
      include: ['src/**/*.test.{ts,tsx}'],
      setupFiles: ['src/test/setup.ts'],
    },
  };
});
