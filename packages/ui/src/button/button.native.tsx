import React from 'react';
import { ActivityIndicator, Pressable, Text } from 'react-native';

import type { ButtonProps } from './button.types';

const variantClasses: Record<
  NonNullable<ButtonProps['variant']>,
  { container: string; text: string }
> = {
  primary: { container: 'bg-blue-600 active:bg-blue-700', text: 'text-white' },
  secondary: {
    container: 'bg-white border border-gray-300 active:bg-gray-50',
    text: 'text-gray-900',
  },
  destructive: { container: 'bg-red-600 active:bg-red-700', text: 'text-white' },
};

/**
 * React Native Button implementation. Styled with NativeWind v4.
 * className prop is valid because nativewind-env.d.ts augments RN component types.
 * Resolved automatically by Metro via the .native.tsx extension.
 */
export const Button: React.FC<ButtonProps> = ({
  label,
  onPress,
  disabled = false,
  variant = 'primary',
  loading = false,
}) => {
  const isDisabled = disabled || loading;
  const classes = variantClasses[variant];

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      className={`flex-row items-center justify-center rounded-md px-4 py-2 ${classes.container} ${isDisabled ? 'opacity-50' : ''}`}
    >
      {loading && (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' ? '#111827' : '#ffffff'}
          className="mr-2"
        />
      )}
      <Text className={`text-sm font-medium ${classes.text}`}>{label}</Text>
    </Pressable>
  );
};
