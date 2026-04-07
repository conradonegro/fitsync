// Minimal stub for native Expo packages that are always jest.mock()'d in tests.
// Prevents Jest from trying to parse ESM/native module chains.
// Exports the expo-secure-store shape so Jest auto-mock creates jest.fn() for each method.
function noop() {}
module.exports = {
  getItemAsync: noop,
  setItemAsync: noop,
  deleteItemAsync: noop,
};
