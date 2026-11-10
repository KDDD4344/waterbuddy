/** App version from package.json, set in vite.config.ts. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Pilot feedback form. Adults only; hidden when empty. */
  readonly VITE_FEEDBACK_URL?: string;
}
