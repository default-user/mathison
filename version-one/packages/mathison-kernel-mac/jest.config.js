module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  testPathIgnorePatterns: ['/node_modules/', '/dist/', '/legacy/', '/test-archive/', '/old_pr/'],
  collectCoverageFrom: ['src/**/*.ts'],
};
