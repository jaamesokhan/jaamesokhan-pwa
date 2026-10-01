/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
/** ISO timestamp of the build, to tell deployments apart. */
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_GANJOOR_BASE_URL?: string;
}
