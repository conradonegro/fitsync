/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ['@fitsync/eslint-config/react'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    ecmaFeatures: { jsx: true },
  },
};
