/** @type {import("eslint").Linter.Config} */
module.exports = {
  extends: ['./react.js'],
  plugins: ['react-native'],
  rules: {
    'react-native/no-unused-styles': 'error',
    'react-native/no-inline-styles': 'warn',
  },
  env: {
    'react-native/react-native': true,
  },
};
