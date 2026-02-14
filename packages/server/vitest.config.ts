import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', 'src/**/*.integration.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json', 'html'],
      include: ['src/services/**/*.ts', 'src/routes/**/*.ts', 'src/db/**/*.ts'],
      exclude: ['node_modules', 'dist', '**/*.d.ts'],
      thresholds: {
        lines: 40,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
