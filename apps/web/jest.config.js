/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/app'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, diagnostics: false }],
  },
  moduleNameMapper: {
    '^@fitsync/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@fitsync/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    '^@fitsync/database-types$': '<rootDir>/../../packages/database-types/src/index.ts',
    // Server client: mocked per-test via jest.mock('@fitsync/database/server', ...)
    '^@fitsync/database/server$': '<rootDir>/__mocks__/database-server.ts',
  },
};
