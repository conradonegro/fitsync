/** @type {import('tailwindcss').Config} */
module.exports = {
  // NativeWind v4 requires content paths for class detection.
  // Include all screen/component files in the mobile app and the shared UI package.
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  presets: [
    // NativeWind's preset configures Tailwind for React Native output.
    require('nativewind/preset'),
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};
