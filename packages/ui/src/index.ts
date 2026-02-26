/**
 * @fitsync/ui
 *
 * Shared component library with platform-split implementations.
 * Each component has a .web.tsx and .native.tsx file.
 *
 * Metro (Expo) resolves .native.tsx automatically.
 * Next.js resolves .web.tsx via webpack config in apps/web/next.config.ts.
 *
 * Component interfaces are defined in .types.ts files —
 * the shared contract between both platform implementations.
 */

export { Button } from './button/index';
export type { ButtonProps } from './button/button.types';
