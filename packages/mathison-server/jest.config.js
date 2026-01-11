module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts'],
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
