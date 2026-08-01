/**
 * Single source of truth for the version shown in the UI.
 *
 * Four different hardcoded strings used to be displayed (v2.4 in About, v1.2 in
 * Settings, v1.0 on the Dashboard) while package.json said something else again.
 * Vite inlines this at build time from the workspace manifest.
 */
export const APP_VERSION = __APP_VERSION__;
export default APP_VERSION;
