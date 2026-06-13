/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Override for the live edge SSE endpoint (defaults to localhost:8787/live). */
  readonly VITE_EDGE_URL?: string
}
interface ImportMeta {
  readonly env: ImportMetaEnv
}
