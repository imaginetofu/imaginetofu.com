/* Big-media CDN prefix.
   VITE_MEDIA_BASE (e.g. https://itofu.b-cdn.net, no trailing slash) is set in .env.production.
   Empty = serve everything from this origin (dev, or before the CDN is wired). Only the heavy
   loops/clips use it; posters and small stills stay on the site origin. */
export const MEDIA_BASE = (import.meta.env.VITE_MEDIA_BASE || "").replace(/\/+$/, "");
export const media = (path) => MEDIA_BASE + path;

// Videos the site used to serve itself (phone hero, Services mosaic sources, work-card loops, case story tiles) move
// to the CDN, because Safari will not play video without byte ranges and the site host does not answer them. One
// switch: while it is false they stay on the site (as before); flip it once every file answers on the CDN, and point
// the Services sources in index.html at %VITE_MEDIA_BASE% (see CLAUDE.md, Nov 16 2026).
export const VIDEO_ON_CDN = false;
export const mediaVideo = (path) => (VIDEO_ON_CDN ? media(path) : path);
