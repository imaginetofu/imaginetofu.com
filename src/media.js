/* Big-media CDN prefix.
   VITE_MEDIA_BASE (e.g. https://itofu.b-cdn.net, no trailing slash) is set in .env.production.
   Empty = serve everything from this origin (dev, or before the CDN is wired). Only the heavy
   loops/clips use it; posters and small stills stay on the site origin. */
export const MEDIA_BASE = (import.meta.env.VITE_MEDIA_BASE || "").replace(/\/+$/, "");
export const media = (path) => MEDIA_BASE + path;
