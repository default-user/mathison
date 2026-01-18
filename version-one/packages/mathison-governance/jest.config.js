module.exports = {
  testEnvironment: 'node',
  passWithNoTests: true,
  preset: 'ts-jest',
  roots: ['<rootDir>/src'],
  moduleFileExtensions: ['ts', 'js'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/legacy/', '/test-archive/', '/old_pr/'],
  transform: {
    '^.+\\.ts$': 'ts-jest'
  }
};
