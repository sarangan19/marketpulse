// Mock mode is on when VITE_USE_MOCKS=1, or when no API URL is configured.
// Real mode is the default whenever VITE_API_URL is set (and VITE_USE_MOCKS is not "1").
export const USE_MOCKS: boolean =
  import.meta.env.VITE_USE_MOCKS === "1" || !import.meta.env.VITE_API_URL;
