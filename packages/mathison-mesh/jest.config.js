module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  // WHY: Map workspace deps to source for test-time resolution
  moduleNameMapper: {
    '^@mathison/memory$': '<rootDir>/../mathison-memory/src/index.ts',
  },
  // WHY: Use test-specific tsconfig with paths for workspace dep resolution
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json' }],
  },
};
