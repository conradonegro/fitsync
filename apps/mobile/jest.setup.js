// React Native / Expo define __DEV__ as a global boolean.
// Jest runs in Node.js where this global is absent — set it to false so
// all `if (__DEV__)` console.log / console.error branches are silenced.
global.__DEV__ = false;
