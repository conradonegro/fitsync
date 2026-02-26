/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ['@fitsync/eslint-config/react-native'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    ecmaFeatures: { jsx: true },
  },
  env: { es2022: true },
};
