/** @type {import("eslint").Linter.Config} */
module.exports = {
  // next/core-web-vitals is provided by eslint-config-next in apps/web.
  // This shared config just adds React rules on top.
  extends: ['./react.js'],
};
