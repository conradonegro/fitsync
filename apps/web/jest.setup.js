// Silence console output during tests.
// Individual tests can spy on console methods when they need to verify logging.
jest.spyOn(console, 'error').mockImplementation(() => {});
jest.spyOn(console, 'warn').mockImplementation(() => {});
