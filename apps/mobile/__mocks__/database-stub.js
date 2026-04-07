// Stub for @fitsync/database used in unit tests.
// All tests that import this module call jest.mock('@fitsync/database'), so
// Jest auto-mocks this stub — each function becomes a jest.fn().
function noop() {}

const supabase = {
  from: noop,
  rpc: noop,
  auth: {
    getUser: noop,
    signOut: noop,
    onAuthStateChange: noop,
  },
  functions: {
    invoke: noop,
  },
};

module.exports = { supabase };
