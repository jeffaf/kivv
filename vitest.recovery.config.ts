import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'tests/unit/automation-recovery.test.ts',
      'tests/unit/shared.test.ts',
      'tests/unit/summarization.test.ts',
    ],
    testTimeout: 30000,
  },
});
