import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';
import { readFileSync } from 'fs';
import { join } from 'path';

export default defineWorkersConfig({
  test: {
    // Global test timeout - prevent hanging tests in CI
    testTimeout: 30000, // 30 seconds per test
    hookTimeout: 30000, // 30 seconds for beforeAll/afterAll hooks
    teardownTimeout: 10000, // 10 seconds for cleanup
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './mcp-server/wrangler.toml',
        },
        miniflare: {
          // Initialize database schema before tests
          d1Databases: ['DB'],
        },
      },
    },
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        '.wrangler/**',
        'tests/**',
        '**/*.config.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'mcp-server/src/**/*.test.ts', 'automation/src/**/*.test.ts'],
    exclude: ['node_modules', 'dist', '.wrangler'],
  },
});
