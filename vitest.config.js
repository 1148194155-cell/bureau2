import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.js'],
    coverage: {
      include: [
        'src/engine/executor.js',
        'src/models/adapter.js',
        'src/review/reviewer.js',
        'src/repo/workflowRepo.js',
        'src/repo/modelRepo.js',
        'src/repo/executionRepo.js',
        'src/repo/knowledgeRepo.js',
        'src/services/workflowService.js',
        'src/services/modelService.js',
        'src/services/executionService.js',
        'src/services/knowledgeService.js',
        'src/services/skillService.js',
        'src/errors.js',
      ],
      reporter: ['text', 'lcov'],
      thresholds: {
        lines: 66,
        functions: 69,
        branches: 60,
        statements: 65,
      },
    },
    environment: 'node',
    globals: true,
    testTimeout: 10000,
  },
});
