/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_USER_POOL_ID: string;
  readonly VITE_CLIENT_ID: string;
  /** "1" forces the in-memory mock API and mock auth (src/api/mock). */
  readonly VITE_USE_MOCKS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
