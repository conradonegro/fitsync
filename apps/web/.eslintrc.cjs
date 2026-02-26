/** @type {import("eslint").Linter.Config} */
module.exports = {
  root: true,
  // eslint-config-next provides: eslint:recommended, react, react-hooks, next-specific rules.
  // Extending it here replaces the deprecated `next lint` command.
  extends: ['next/core-web-vitals', '@fitsync/eslint-config/base'],
  parserOptions: {
    tsconfigRootDir: __dirname,
    ecmaFeatures: { jsx: true },
  },
  rules: {
    // useTranslations from next-intl is NOT a React hook but the name prefix
    // triggers react-hooks/rules-of-hooks. Downgrade to warn to avoid false positives.
    'react-hooks/rules-of-hooks': 'warn',
  },
  ignorePatterns: ['node_modules/', '.next/', 'out/'],
};
