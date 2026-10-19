/// <reference types="vite/client" />

/** The package version and commit the build came from (build/buildId.mjs), sent with analytics. */
declare const __HK_BUILD__: string;

/** The iOS web bundle's version, 0.0.0 outside the iOS workflows (build/buildId.mjs, platform/ios/ota.ts). */
declare const __HK_BUNDLE__: string;

/** The art set this build ships, 'monk' or 'corgi' (build/theme.mjs, src/theme.ts). */
declare const __HK_THEME__: string;

/** The backend of this build's theme; each theme keeps its own players and numbers (build/theme.mjs). */
declare const __HK_API__: string;
