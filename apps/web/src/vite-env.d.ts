/// <reference types="vite/client" />

// Drops vite/client's `Record<string, any>` fallback on `ImportMetaEnv`, so an
// undeclared key is a compile error instead of an `any` that leaks into callers.
interface ViteTypeOptions {
  strictImportMetaEnv: unknown;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_LOCAL_SCAFFOLD_AUTH?: string;
}
