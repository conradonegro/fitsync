import React from 'react';

import type { ButtonProps } from './button.types';

const variantClasses: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary: 'bg-blue-600 text-white hover:bg-blue-700 focus-visible:ring-blue-500',
  secondary:
    'bg-white text-gray-900 border border-gray-300 hover:bg-gray-50 focus-visible:ring-gray-500',
  destructive: 'bg-red-600 text-white hover:bg-red-700 focus-visible:ring-red-500',
};

/**
 * Web (default) Button implementation. Styled with Tailwind CSS.
 *
 * File resolution order for this component:
 *   TypeScript typecheck → button.tsx  (this file, no .web.tsx awareness)
 *   webpack (Next.js)   → button.web.tsx → re-exports from ./button (this file)
 *   Metro (Expo)        → button.native.tsx (NativeWind implementation)
 */
export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  loading = false,
}) => {
  const isDisabled = disabled || loading;

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={isDisabled}
      className={[
        'inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        'disabled:pointer-events-none disabled:opacity-50',
        variantClasses[variant],
      ].join(' ')}
    >
      {loading && (
        <svg
          className="mr-2 h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
      )}
      {label}
    </button>
  );
};
