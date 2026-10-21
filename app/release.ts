declare const __PFX_APP_RELEASE__: { version: string; channel: string; label: string; commit: string };

// Application release; the processing core keeps its independent version.
export const studioChannel = __PFX_APP_RELEASE__.channel;
export const studioVersion = __PFX_APP_RELEASE__.version;
export const studioReleaseLabel = __PFX_APP_RELEASE__.label;
