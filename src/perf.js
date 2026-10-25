/* Imagine TOFU v3 — phone performance layer.

   LITE: touch / narrow screens. Sets html.is-lite so CSS can drop the
   effects a phone GPU pays for on every frame (backdrop blur, full-screen
   blend layers, big blurred auras), and tells the scripts to take their
   cheaper paths.

   Governor: every ambient loop (looping GSAP tweens, CSS animations) is
   paused while its section is more than a screen away. Without it a phone
   keeps animating the hero sprouts, cube, marquee and mascots the whole way
   down the page — work nobody can see that still costs style + paint. */

export const LITE = matchMedia("(pointer: coarse), (hover: none), (max-width: 899px)").matches;
// touch screens scroll natively (compositor thread); smooth-scroll libraries only add main-thread work there
export const TOUCH = matchMedia("(pointer: coarse)").matches;

if (LITE) document.documentElement.classList.add("is-lite");

// Firefox on a phone (Oct 24, from Pixel 10 Pro traces): its renderer redraws every screen tile that a
// script changes during a scroll, and on that GPU a full tile redraw costs most of a frame. So in GECKO
// mode every scroll-triggered reveal runs as a CSS transition (Firefox animates those on the compositor,
// no redraw), scroll-scrubbed parallax is dropped, and loops that repaint every frame are paused.
// Chrome / Safari / desktop are untouched.
export const GECKO = LITE && navigator.userAgent.includes("Firefox/");
if (GECKO) document.documentElement.classList.add("is-gecko");

const SECTIONS = [
  ["hero", ".it-hero"],
  ["marquee", ".it-marquee"],
  ["intro", ".it-intro"],
  ["work", ".it-work"],
  ["services", ".it-services"],
  ["dream", ".it-dream"],
  ["studio", ".it-studio"],
  ["cta", ".it-cta"],
  ["footer", ".it-footer"],
];

/* ---------- desktop tier: full / strained (Oct 25 2026) ----------
   The effects are tuned for a decent GPU. A machine that cannot hold the frame rate gets the costliest layers in
   their cheap versions for the rest of the visit: html.is-strained (lite.css, the same swaps phones get) +
   isStrained() (motion.js: motes at half rate on a 1.25x canvas; dream-glass.js: ring dpr 1.25, resonance at
   half res, no petal flare, heavy draws at half rate). Phones already run LITE and never enter this tier.

   Evidence, all one-way (nothing ever un-strains; a flip after first paint would be visible):
   1. The inline <head> script of every page (synchronous, before first paint; skipped on LITE and under reduced
      motion). Hard evidence flips the tier there: Save-Data / prefers-reduced-data ("save-data"), a dual-core CPU
      ("cores"). Softer signs only become a HINT (html[data-strain-hint]): 3-4 cores, deviceMemory <= 4 (under
      8GB, Chromium only), more than 6e6 physical pixels (4K class, 5K iMac, the 16" retina).
   2. gpuClass() below, once at module init on the home page (behind the preloader, before motion / dream init),
      from the WebGL renderer string of a throwaway context (context lost right after): a software renderer
      (SwiftShader, llvmpipe, Microsoft Basic Render) always strains ("gpu-software"); an integrated GPU (Intel
      HD / UHD / Iris, AMD Radeon(TM) Graphics / Vega / 680M-890M, Mali, Adreno) driving more than 3e6 physical
      pixels strains ("gpu-igpu": a 1080p laptop keeps full, a 1440p or retina one does not); a 4K-class screen
      on a GPU that is neither known-capable (Apple M, GeForce / RTX, Radeon RX / Pro, Intel Arc) nor
      identifiable strains ("px"). A capable GPU on a 4K screen keeps the full look and relies on 3.
   3. initFrameWatch(): frame times measured from 7s after load (the preloader, bloom and hero intro are heavy by
      design and end by ~6.8s). A hinted machine strains after one bad ~1.5s window, any other after two
      ("frames"), so a hinted machine that struggles switches at ~8.5s, still on the hero.

   Read it without a console: html[data-tier] = lite | gecko | full | strained, html[data-strain] lists the
   reasons above (space separated), html[data-strain-hint] the hints, html[data-gpu] the GPU class. */
const doc = document.documentElement;
let strained = !LITE && doc.classList.contains("is-strained");   // the <head> script may have decided already
const HINT = (doc.dataset.strainHint || "").split(" ").filter(Boolean);
export const isStrained = () => strained;
function strain(why) {
  if (LITE) return;
  strained = true;
  doc.classList.add("is-strained");
  doc.dataset.tier = "strained";
  doc.dataset.strain = doc.dataset.strain ? doc.dataset.strain + " " + why : why;
}
function gpuClass() {
  let r = "";
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl") || c.getContext("experimental-webgl");
    if (!gl) return "unknown";                                    // WebGL off: no evidence either way
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    r = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || "");
    gl.getExtension("WEBGL_lose_context")?.loseContext();         // never hold a context the page does not use
  } catch (e) { return "unknown"; }
  if (/SwiftShader|llvmpipe|softpipe|Microsoft Basic Render|Software Adapter|Mesa OffScreen/i.test(r)) return "software";
  if (
    /Intel.*\b(?:HD|UHD|Iris)\b/i.test(r) ||                                   // Intel HD 4000 .. Iris Xe
    /AMD Radeon(?:\(TM\))? (?:(?:RX )?Vega \d+ )?Graphics\b/i.test(r) ||        // Radeon(TM) Graphics, Vega 8 / RX Vega 10 Graphics
    /Radeon(?:\(TM\))? \d{3}M\b/i.test(r) ||                                    // Radeon 680M / 780M / 880M / 890M
    /\bMali\b|\bAdreno\b/i.test(r)
  ) return "igpu";
  if (/Apple (?:GPU|M\d)|NVIDIA|GeForce|\bRTX\b|Radeon (?:RX|Pro|VII)\b|Intel.*\bArc\b/i.test(r)) return "capable";
  return r ? "other" : "unknown";
}
doc.dataset.tier = GECKO ? "gecko" : LITE ? "lite" : strained ? "strained" : "full";
if (!LITE && !strained && !doc.classList.contains("reduced") && document.querySelector(".it-hero")) {
  const g = gpuClass();
  const px = innerWidth * innerHeight * devicePixelRatio * devicePixelRatio;
  doc.dataset.gpu = g;
  if (g === "software") strain("gpu-software");
  else if (g === "igpu" && px > 3e6) strain("gpu-igpu");
  else if (HINT.includes("px") && g !== "capable") strain("px");
}
export function initFrameWatch() {
  if (LITE || strained || !("requestAnimationFrame" in window)) return;
  const need = HINT.length ? 1 : 2;   // a hinted machine gets one strike, any other two (a single hitch is not evidence)
  let last = 0, buf = [], bad = 0;
  const tick = (t) => {
    const d = last ? t - last : 0; last = t;
    if (d > 0 && d < 250 && !document.hidden) buf.push(d);    // skip tab switches / long pauses
    if (buf.length >= 90) {                                     // ~1.5s at 60Hz
      const s = buf.sort((a, b) => a - b), med = s[s.length >> 1], p90 = s[Math.floor(s.length * 0.9)];
      buf = [];
      bad = med > 20 || p90 > 34 ? bad + 1 : Math.max(0, bad - 1);   // under ~50fps, or frequent long frames
      if (bad >= need) { strain("frames"); return; }
    }
    requestAnimationFrame(tick);
  };
  // start once the preloader, the bloom and the hero intro (all heavy by design) are done, while the hero is still on screen
  setTimeout(() => requestAnimationFrame(tick), 7000);
}

const on = Object.create(null); // name → currently near the viewport
export const isOn = (name) => on[name] !== false;

const WIDE = matchMedia("(min-width: 900px)");

export function initPerf({ gsap }) {
  // Desktop (Oct 25 2026 smoothness pass): the observer runs here too, CSS-only. A running CSS animation marks its
  // element for style recalc every frame whether or not it is on screen (33 of them page-wide while the hero shows:
  // tile auras, After Dark cards / trails / doodles / halo, studio mascot, CTA, footer dot), so sections more than
  // 35% of a screen away get .is-off on desktop as well. The GSAP loops are left alone there: the hero cube is a
  // fixed element that rides the whole page, and the hero's own idle loops already gate themselves on isOn().
  const cssOnly = !LITE;
  const secs = SECTIONS.map(([name, sel]) => ({ name, el: document.querySelector(sel) })).filter((s) => s.el);
  if (!secs.length || !("IntersectionObserver" in window)) return;

  const owner = new WeakMap(); // tween/timeline → the section (or sections) that keep it alive
  const mine = new Set(); // tweens this governor paused (never resume anything it didn't pause)

  const firstTarget = (t) => {
    if (t.targets) return t.targets()[0];
    const kid = t.getChildren?.(true, true, false)[0];
    return kid?.targets?.()[0];
  };
  const ownersOf = (t) => {
    if (owner.has(t)) return owner.get(t);
    const el = firstTarget(t);
    let names = null;
    if (el && el.nodeType === 1) {
      // the hero cube is position:fixed: on a phone it rides on into Hello (alive for both); on a wide
      // layout (tablet landscape) it is parked beside the content all the way down, so never pause it
      if (el.closest?.(".it-cube")) names = WIDE.matches ? null : ["hero", "intro"];
      else {
        const s = secs.find((x) => x.el.contains(el));
        if (s) names = [s.name];
      }
    }
    owner.set(t, names);
    return names;
  };

  function sync() {
    const all = gsap.globalTimeline.getChildren(true, true, true);
    for (const t of all) {
      if (t.repeat?.() !== -1) continue;
      const names = ownersOf(t);
      if (!names) continue;
      const alive = names.some((n) => on[n]);
      if (!alive && !t.paused() && !mine.has(t)) { t.pause(); mine.add(t); }
      else if (alive && mine.has(t)) { t.resume(); mine.delete(t); }
    }
  }

  const io = new IntersectionObserver(
    (entries) => {
      let changed = false;
      for (const e of entries) {
        const s = secs.find((x) => x.el === e.target);
        if (!s) continue;
        const now = e.isIntersecting;
        if (on[s.name] === now) continue;
        on[s.name] = now;
        changed = true;
      }
      if (!changed) return;
      // the cube (a child of the hero) is still on screen in Hello, so the hero's CSS loops follow both
      for (const s of secs) {
        // the hero stays alive while Hello is on screen (the cube rides into it). The wide exception is the TABLET
        // landscape layout, where the cube is parked beside the content all the way down; on desktop the cube is
        // visibility:hidden past Hello, so the hero's loops (sprouts, aura, cloud, headline shimmer) can rest
        const alive = on[s.name] || (s.name === "hero" && (on.intro || (WIDE.matches && LITE)));
        s.el.classList.toggle("is-off", !alive); // CSS animations pause with it
      }
      if (!cssOnly) sync();
    },
    { rootMargin: "35% 0px 35% 0px" }
  );
  secs.forEach((s) => { on[s.name] = true; io.observe(s.el); });

  // loops created after a section went quiet (delayed starts) get caught on the next pass
  if (!cssOnly) setInterval(() => { if (!document.hidden) sync(); }, 2500);
}

