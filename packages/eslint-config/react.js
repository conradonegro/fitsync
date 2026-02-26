/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ['./base.js'],
  plugins: ['react', 'react-hooks'],
  rules: {
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react/jsx-uses-react': 'off',
    'react/react-in-jsx-scope': 'off',
  },
  settings: {
    react: { version: 'detect' },
  },
};
