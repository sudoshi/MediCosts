import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['leverage/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['leverage/**/*.ts'],
      exclude: ['leverage/**/__tests__/**', 'leverage/**/*.test.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
