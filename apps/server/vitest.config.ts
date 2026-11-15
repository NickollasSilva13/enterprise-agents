import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Only measured by `npm run test:coverage`. The thresholds are the goals
    // of TESTING.md, section 5: the run fails if any area drops below its own.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        // Process entry points: exercised by the end-to-end tests, which start
        // the real server, and not by anything that runs inside Vitest.
        'src/main.ts',
        'src/db/migrate-cli.ts',
        // Table declarations: no logic of their own.
        'src/db/schema.ts',
      ],
      reporter: ['text'],
      thresholds: {
        lines: 80,
        'src/security/**': { lines: 90 },
        'src/tools/**': { lines: 90 },
        'src/runtime/**': { lines: 85 },
      },
    },
  },
});
