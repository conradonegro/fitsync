/**
 * Bundler resolves the correct platform implementation:
 *   Metro (Expo):    button.native.tsx  (NativeWind)
 *   webpack (Next):  button.web.tsx → button.tsx
 *   TypeScript:      button.tsx  (web/default)
 */
export { Button } from './button';
export type { ButtonProps } from './button.types';
