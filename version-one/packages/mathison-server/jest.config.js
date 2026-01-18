module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/legacy/', '/test-archive/', '/old_pr/'],
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  collectCoverage: false,
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^mathison-storage/src/(.*)$': '<rootDir>/../mathison-storage/src/$1',
  },
  globals: {
    'ts-jest': {
      tsconfig: {
        resolveJsonModule: true,
      },
    },
  },
};
