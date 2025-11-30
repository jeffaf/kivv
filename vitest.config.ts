import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
  test: {
    poolOptions: {
      workers: {
        wrangler: {
          configPath: './mcp-server/wrangler.toml',
        },
      },
    },
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
