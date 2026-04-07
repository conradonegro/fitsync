/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/db', '<rootDir>/store', '<rootDir>/sync'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  setupFiles: ['<rootDir>/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, diagnostics: false }],
  },
  moduleNameMapper: {
    // Stub native Expo packages so Jest never loads their ESM/native module chains.
    // These are always jest.mock()'d in tests that use them.
    '^expo-secure-store$': '<rootDir>/__mocks__/expo-native-stub.js',
    '^expo-sqlite$': '<rootDir>/__mocks__/expo-native-stub.js',
    // Point directly at workspace package source so ts-jest can transform it
    '^@fitsync/shared$': '<rootDir>/../../packages/shared/src/index.ts',
    '^@fitsync/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    // database-types are type-only; map to barrel so ts-jest never needs to execute them
    '^@fitsync/database-types$': '<rootDir>/../../packages/database-types/src/index.ts',
    // @fitsync/database defaults to client.web.ts in Node.js (no react-native condition);
    // stub it so jest.mock('@fitsync/database') can auto-mock the right shape without
    // loading the web client that throws on missing env vars.
    '^@fitsync/database$': '<rootDir>/__mocks__/database-stub.js',
  },
};
