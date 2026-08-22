/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Static-hosting base path, e.g. /delis-tg/ on GitHub Pages. */
  readonly VITE_BASE_PATH?: string;
  /** Dev server's internal API proxy target. */
  readonly VITE_DEV_API_PROXY_TARGET?: string;
  /** Dev-only: matches server DELIS_DEV_ADMIN_TOKEN for preview testing. */
  readonly VITE_DEV_ADMIN_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
