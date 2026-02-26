// Learn more: https://docs.expo.dev/guides/monorepos/
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// --- Monorepo configuration ---
// Tell Metro to watch all packages in the monorepo.
// Required because pnpm hoisted node_modules doesn't automatically
// make monorepo packages visible to Metro.
config.watchFolders = [workspaceRoot];

// Tell Metro where to resolve modules from.
// Order matters: project root first, then workspace root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Ensure Metro resolves workspace packages correctly.
config.resolver.disableHierarchicalLookup = false;

// Enable package.json "exports" field resolution.
// Required for @fitsync/* packages that use subpath exports
// (e.g. @fitsync/shared/locales/en, @fitsync/database/server).
// Without this Metro ignores the "exports" field and falls back to "main".
config.resolver.unstable_enablePackageExports = true;

// --- NativeWind v4 configuration ---
// withNativeWind enables Tailwind CSS support in React Native.
// cssPath points to the global CSS file with @tailwind directives.
module.exports = withNativeWind(config, {
  input: './global.css',
  inlineRem: 16,
});
