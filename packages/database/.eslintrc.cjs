/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  extends: ['@fitsync/eslint-config/base'],
  parserOptions: {
    tsconfigRootDir: __dirname,
  },
};
